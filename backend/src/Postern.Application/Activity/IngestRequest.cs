namespace Postern.Application.Activity;

public sealed record IngestRequest(
    string? RecipientAddress,
    string? EnvelopeSender,
    string? FromHeader,
    string? Subject,
    string? AuthenticationResult);
