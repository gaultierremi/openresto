using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Controllers;

/// <summary>
/// The platform's legal documents, public: guests and restaurateurs read the same text. They are
/// templates and say so (<see cref="LegalDocumentDto.NeedsLegalReview"/>).
/// </summary>
[ApiController]
[Route("api/legal")]
[AllowAnonymous]
[EnableRateLimiting("public")]
public class LegalController : ControllerBase
{
    [HttpGet]
    public ActionResult<List<LegalDocumentSummaryDto>> List()
        => Ok(LegalCatalog.All.Select(d => new LegalDocumentSummaryDto { Key = d.Key, Version = d.Version }).ToList());

    [HttpGet("{key}")]
    public ActionResult<LegalDocumentDto> Get(string key)
        => Ok(LegalCatalog.ToDto(LegalCatalog.Find(key)
            ?? throw new NotFoundException("Document not found.") { Code = ErrorCodes.LegalDocumentNotFound }));
}
