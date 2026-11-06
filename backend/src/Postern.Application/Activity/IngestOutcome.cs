namespace Postern.Application.Activity;

public sealed record IngestOutcome(IngestResult Result, Guid? AliasId = null, Guid? UserId = null);
