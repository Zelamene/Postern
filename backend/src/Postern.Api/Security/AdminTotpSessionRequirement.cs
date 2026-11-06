using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Application.Accounts;

namespace Postern.Api.Security;

public sealed class AdminTotpSessionRequirement : IAuthorizationRequirement
{
}

public sealed class AdminTotpSessionHandler(IAccountRepository accounts)
    : AuthorizationHandler<AdminTotpSessionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        AdminTotpSessionRequirement requirement)
    {
        var userIdClaim = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var verifiedAtClaim = context.User.FindFirstValue("amr_time");
        if (!Guid.TryParse(userIdClaim, out var userId)
            || !long.TryParse(
                verifiedAtClaim,
                System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture,
                out var verifiedAtMilliseconds))
        {
            return;
        }

        var cancellationToken = context.Resource is HttpContext httpContext
            ? httpContext.RequestAborted
            : CancellationToken.None;
        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is
            {
                IsAdmin: true,
                Status: "active",
                AdminTotpEnabledAt: { } enabledAt
            }
            && verifiedAtMilliseconds >= enabledAt.ToUnixTimeMilliseconds())
        {
            context.Succeed(requirement);
        }
    }
}
