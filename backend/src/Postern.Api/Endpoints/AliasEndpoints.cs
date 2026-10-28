using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Application.Aliases;
using Postern.Domain.Aliases;

namespace Postern.Api.Endpoints;

public static class AliasEndpoints
{
    public static IEndpointRouteBuilder MapAliasEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/aliases");

        group.MapGet("", ListAliasesAsync)
            .RequireAuthorization();
        group.MapPost("", CreateAliasAsync)
            .RequireAuthorization();
        group.MapPatch("{aliasId:guid}", UpdateAliasAsync)
            .RequireAuthorization();
        group.MapPatch("{aliasId:guid}/disable", DisableAliasAsync)
            .RequireAuthorization();
        group.MapDelete("{aliasId:guid}", DeleteAliasAsync)
            .RequireAuthorization();
        group.MapPatch("{aliasId:guid}/delete", DeleteAliasAsync)
            .RequireAuthorization();
        group.MapPost("{aliasId:guid}/replace", ReplaceAliasWithNewAsync)
            .RequireAuthorization();
        group.MapPatch("{aliasId:guid}/replace/{replacementAliasId:guid}", ReplaceAliasAsync)
            .RequireAuthorization();
        group.MapGet("{aliasId:guid}/expected-senders", ListExpectedSendersAsync)
            .RequireAuthorization();
        group.MapPost("{aliasId:guid}/expected-senders", AddExpectedSenderAsync)
            .RequireAuthorization();
        group.MapPost("{aliasId:guid}/mark-expected", MarkExpectedSenderAsync)
            .RequireAuthorization();
        group.MapPost("{aliasId:guid}/block-sender", BlockSenderAsync)
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListAliasesAsync(
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var aliases = await service.ListAsync(currentUserId.Value, cancellationToken);
        return Results.Ok(aliases.Select(MapAliasResponse));
    }

    private static async Task<IResult> CreateAliasAsync(
        CreateAliasRequest request,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var alias = await service.CreateAsync(currentUserId.Value, request.Label, request.PurposeMetadata ?? "", cancellationToken);
        return alias is null
            ? Results.BadRequest(new { error = "reserved_or_invalid_label" })
            : Results.Created($"/api/aliases/{alias.Id}", MapAliasResponse(alias));
    }

    private static async Task<IResult> DisableAliasAsync(
        Guid aliasId,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var success = await service.DisableAsync(currentUserId.Value, aliasId, cancellationToken);
        return success ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> DeleteAliasAsync(
        Guid aliasId,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var success = await service.DeleteAsync(currentUserId.Value, aliasId, cancellationToken);
        return success ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> ReplaceAliasAsync(
        Guid aliasId,
        Guid replacementAliasId,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var success = await service.ReplaceAsync(currentUserId.Value, aliasId, replacementAliasId, cancellationToken);
        return success ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> ReplaceAliasWithNewAsync(
        Guid aliasId,
        ReplaceAliasRequest request,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var replacement = await service.CreateAsync(currentUserId.Value, request.Label ?? "replaced", request.PurposeMetadata ?? string.Empty, cancellationToken);
        if (replacement is null)
        {
            return Results.BadRequest(new { error = "cannot_create_replacement" });
        }

        await service.CopyExpectedSendersAsync(currentUserId.Value, aliasId, replacement.Id, cancellationToken);
        var success = await service.ReplaceAsync(currentUserId.Value, aliasId, replacement.Id, cancellationToken);
        return success ? Results.Ok(MapAliasResponse(replacement)) : Results.NotFound();
    }

    private static async Task<IResult> UpdateAliasAsync(
        Guid aliasId,
        UpdateAliasRequest request,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        if (string.Equals(request.Action, "disable", StringComparison.OrdinalIgnoreCase))
        {
            var success = await service.DisableAsync(currentUserId.Value, aliasId, cancellationToken);
            return success ? Results.NoContent() : Results.NotFound();
        }

        if (string.Equals(request.Action, "delete", StringComparison.OrdinalIgnoreCase))
        {
            var success = await service.DeleteAsync(currentUserId.Value, aliasId, cancellationToken);
            return success ? Results.NoContent() : Results.NotFound();
        }

        return Results.BadRequest(new { error = "unknown_action" });
    }

    private static async Task<IResult> ListExpectedSendersAsync(
        Guid aliasId,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var senders = await service.ListExpectedSendersAsync(currentUserId.Value, aliasId, cancellationToken);
        return Results.Ok(senders.Select(sender => new ExpectedSenderResponse(sender.Id, sender.SenderEtld1, sender.CreatedAt)));
    }

    private static async Task<IResult> AddExpectedSenderAsync(
        Guid aliasId,
        AddExpectedSenderRequest request,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var sender = await service.AddExpectedSenderAsync(currentUserId.Value, aliasId, request.SenderEtld1, cancellationToken);
        return sender is null
            ? Results.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(AddExpectedSenderRequest.SenderEtld1)] = ["Sender domain is required and must be <= 253 characters."]
            })
            : Results.Created($"/api/aliases/{aliasId}/expected-senders/{sender.Id}",
                new ExpectedSenderResponse(sender.Id, sender.SenderEtld1, sender.CreatedAt));
    }

    private static async Task<IResult> MarkExpectedSenderAsync(
        Guid aliasId,
        MarkExpectedSenderRequest request,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var success = await service.MarkExpectedSenderAsync(currentUserId.Value, aliasId, request.SenderEtld1, cancellationToken);
        return success ? Results.NoContent() : Results.ValidationProblem(new Dictionary<string, string[]>
        {
            [nameof(MarkExpectedSenderRequest.SenderEtld1)] = ["Sender domain is required and must be <= 253 characters."]
        });
    }

    private static async Task<IResult> BlockSenderAsync(
        Guid aliasId,
        BlockSenderRequest request,
        ClaimsPrincipal user,
        AliasService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        var success = await service.BlockSenderAsync(currentUserId.Value, aliasId, request.SenderEtld1, cancellationToken);
        return success ? Results.NoContent() : Results.ValidationProblem(new Dictionary<string, string[]>
        {
            [nameof(BlockSenderRequest.SenderEtld1)] = ["Sender domain is required and must be <= 253 characters."]
        });
    }

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    private static AliasResponse MapAliasResponse(Alias alias) =>
        new(
            alias.Id,
            alias.UserId,
            alias.Label,
            alias.RandomSuffix,
            alias.FullAddress,
            alias.PurposeMetadata,
            alias.Category,
            alias.Status,
            alias.ReplacedByAliasId,
            alias.KvDirty,
            alias.CreatedAt,
            alias.DeletedAt);

    public sealed record CreateAliasRequest(string? Label, string? PurposeMetadata);
    public sealed record UpdateAliasRequest(string Action);
    public sealed record ReplaceAliasRequest(string? Label, string? PurposeMetadata);
    public sealed record AddExpectedSenderRequest(string SenderEtld1);
    public sealed record MarkExpectedSenderRequest(string SenderEtld1);
    public sealed record BlockSenderRequest(string SenderEtld1);

    public sealed record AliasResponse(
        Guid Id,
        Guid? UserId,
        string? Label,
        string? RandomSuffix,
        string? FullAddress,
        string? PurposeMetadata,
        string? Category,
        AliasStatus Status,
        Guid? ReplacedByAliasId,
        bool KvDirty,
        DateTimeOffset CreatedAt,
        DateTimeOffset? DeletedAt);

    public sealed record ExpectedSenderResponse(
        Guid Id,
        string SenderEtld1,
        DateTimeOffset CreatedAt);
}
