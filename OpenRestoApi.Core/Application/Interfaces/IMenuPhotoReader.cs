namespace OpenRestoApi.Core.Application.Interfaces;

public interface IMenuPhotoReader
{
    Task<string> ReadAsync(Stream source, string contentType, string language, CancellationToken cancellationToken);
}
