using System.ComponentModel;
using System.Diagnostics;
using CustomAccessibility.Attributes;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Infrastructure.Media;

[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[ExternalAccessAllowed]
internal sealed class MenuPhotoReader : IMenuPhotoReader
{
    private static readonly SemaphoreSlim Slots = new(1, 1);

    public async Task<string> ReadAsync(Stream source, string contentType, string language, CancellationToken cancellationToken)
    {
        string trainedLanguage = language switch { "fr" => "fra", "nl" => "nld", "en" => "eng", _ => throw Unreadable() };
        if (!await Slots.WaitAsync(0, cancellationToken)) throw Unreadable();
        string directory = Path.Combine(Path.GetTempPath(), $"openresto-menu-{Guid.NewGuid():N}");
        try
        {
            if (OperatingSystem.IsWindows()) Directory.CreateDirectory(directory);
            else Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            ProcessedImage image = SiteImageProcessor.Process(source, contentType, SiteImageKind.MenuImport);
            string path = Path.Combine(directory, "menu.jpg");
            await File.WriteAllBytesAsync(path, image.Data, cancellationToken);
            var start = new ProcessStartInfo("tesseract")
            {
                UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true,
                CreateNoWindow = true,
            };
            foreach (string argument in new[] { path, "stdout", "-l", trainedLanguage, "--psm", "6" }) start.ArgumentList.Add(argument);
            start.Environment["OMP_THREAD_LIMIT"] = "1";
            using var process = new Process { StartInfo = start };
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(20));
            bool started = false;
            try
            {
                started = process.Start();
                Task<string> output = ReadBoundedAsync(process.StandardOutput, deadline.Token);
                Task<string> errors = ReadBoundedAsync(process.StandardError, deadline.Token);
                await Task.WhenAll(output, errors, process.WaitForExitAsync(deadline.Token));
                if (process.ExitCode != 0) throw Unreadable();
                return await output;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw Unreadable(); }
            catch (Win32Exception) { throw Unreadable(); }
            finally
            {
                if (started && !process.HasExited) process.Kill(entireProcessTree: true);
            }
        }
        finally
        {
            try
            {
                if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
            }
            finally { Slots.Release(); }
        }
    }

    private static async Task<string> ReadBoundedAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        char[] buffer = new char[MenuImport.MaxTextLength + 1];
        int length = 0;
        while (length < buffer.Length)
        {
            int read = await reader.ReadAsync(buffer.AsMemory(length), cancellationToken);
            if (read == 0) return new string(buffer, 0, length);
            length += read;
        }
        throw Unreadable();
    }

    private static ValidationException Unreadable() => new("La photo n’a pas pu être lue. Réessayez avec une photo nette ou collez le texte de votre carte.")
    { Code = ErrorCodes.SiteImageUnreadable };
}
