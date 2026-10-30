using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Application.Accounts;
using Postern.Application.Administration;

namespace Postern.Api.Endpoints;

public static class AdministrationEndpoints
{
    public static IEndpointRouteBuilder MapAdministrationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin")
            .RequireAuthorization(policy => policy.RequireRole("admin"));

        group.MapPost("/suspended-users/rebuild", RebuildSuspendedUsersAsync);
        group.MapPost("/users/{userId:guid}/suspend", SuspendUserAsync);
        group.MapPost("/users/{userId:guid}/resume", ResumeUserAsync);
        group.MapGet("/global-blocklist", ListBlockedDomainsAsync);
        group.MapPost("/global-blocklist", BlockDomainAsync);
        group.MapDelete("/global-blocklist/{domain}", UnblockDomainAsync);

        return endpoints;
    }

    private static async Task<IResult> RebuildSuspendedUsersAsync(
        SuspendedUserService service,
        CancellationToken cancellationToken)
    {
        await service.RebuildAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> SuspendUserAsync(
        Guid userId,
        SuspendUserRequest? request,
        ClaimsPrincipal user,
        AdministrationService service,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.SuspendUserAsync(
            adminUserId.Value,
            userId,
            request?.Reason,
            cancellationToken);

        return ToResult(outcome);
    }

    private static async Task<IResult> ResumeUserAsync(
        Guid userId,
        ResumeUserRequest? request,
        ClaimsPrincipal user,
        AdministrationService service,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.ResumeUserAsync(
            adminUserId.Value,
            userId,
            request?.Reason,
            cancellationToken);

        return ToResult(outcome);
    }

    private static async Task<IResult> BlockDomainAsync(
        BlockDomainRequest request,
        ClaimsPrincipal user,
        AdministrationService service,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.BlockDomainAsync(
            adminUserId.Value,
            request.Domain,
            request.Reason,
            cancellationToken);

        return ToResult(outcome);
    }

    private static async Task<IResult> UnblockDomainAsync(
        string domain,
        ClaimsPrincipal user,
        AdministrationService service,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.UnblockDomainAsync(adminUserId.Value, domain, cancellationToken);
        return ToResult(outcome);
    }

    private static async Task<IResult> ListBlockedDomainsAsync(
        AdministrationService service,
        CancellationToken cancellationToken)
    {
        var domains = await service.ListBlockedDomainsAsync(cancellationToken);
        return Results.Ok(new { domains });
    }

    private static IResult ToResult(AdminOutcome outcome) =>
        outcome switch
        {
            AdminOutcome.Succeeded => Results.NoContent(),
            AdminOutcome.NotFound => Results.NotFound(),
            _ => Results.BadRequest()
        };

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed record SuspendUserRequest(string? Reason);

    public sealed record ResumeUserRequest(string? Reason);

    public sealed record BlockDomainRequest(string? Domain, string? Reason);
}
