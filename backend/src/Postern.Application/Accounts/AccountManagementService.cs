using Postern.Application.Aliases;
using Postern.Application.Integrations;

namespace Postern.Application.Accounts;

public enum ForwardingChangeResult
{
    Success,
    Invalid,
    VerificationRequired,
    NotFound
}

public sealed class AccountManagementService(
    IAccountRepository accounts,
    IAliasRepository aliases,
    IDestinationService destinations,
    IKvWriter kvWriter,
    TimeProvider timeProvider)
{
    public async Task<ForwardingChangeResult> ChangeForwardingAddressAsync(
        Guid userId,
        string newForwardingAddress,
        CancellationToken cancellationToken)
    {
        if (!EmailAddressNormalizer.TryNormalize(newForwardingAddress, out var nextAddress))
        {
            return ForwardingChangeResult.Invalid;
        }

        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return ForwardingChangeResult.NotFound;
        }

        var previousAddress = user.EffectiveForwardingAddress;

        if (string.Equals(previousAddress, nextAddress, StringComparison.OrdinalIgnoreCase))
        {
            return ForwardingChangeResult.Success;
        }

        try
        {
            await destinations.AddAsync(nextAddress, cancellationToken);
        }
        catch
        {
            return ForwardingChangeResult.Invalid;
        }

        if (!await destinations.IsVerifiedAsync(nextAddress, cancellationToken))
        {
            return ForwardingChangeResult.VerificationRequired;
        }

        if (!await accounts.UpdateForwardingAddressAsync(userId, nextAddress, cancellationToken))
        {
            return ForwardingChangeResult.NotFound;
        }

        await RepublishAliasesAsync(userId, nextAddress, cancellationToken);

        var stillUsed = await accounts.CountUsersUsingForwardingAddressAsync(
            previousAddress,
            userId,
            cancellationToken);
        if (stillUsed == 0)
        {
            try
            {
                await destinations.RemoveAsync(previousAddress, cancellationToken);
            }
            catch
            {
            }
        }

        return ForwardingChangeResult.Success;
    }

    public async Task<bool> DeleteAccountAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return false;
        }

        foreach (var alias in user.Aliases.ToList())
        {
            if (!string.IsNullOrWhiteSpace(alias.FullAddress))
            {
                try
                {
                    await kvWriter.DeleteAsync(alias.FullAddress.ToLowerInvariant(), cancellationToken);
                }
                catch
                {
                }
            }
        }

        try
        {
            await destinations.RemoveAsync(user.EffectiveForwardingAddress, cancellationToken);
        }
        catch
        {
        }

        return await accounts.DeleteAccountAsync(userId, timeProvider.GetUtcNow(), cancellationToken);
    }

    private async Task RepublishAliasesAsync(
        Guid userId,
        string destination,
        CancellationToken cancellationToken)
    {
        var ownedAliases = await aliases.ListByUserAsync(userId, cancellationToken);
        foreach (var alias in ownedAliases)
        {
            if (alias.FullAddress is null)
            {
                continue;
            }

            var blockedSenders = (await aliases.ListExpectedSendersAsync(
                    alias.Id,
                    userId,
                    cancellationToken))
                .Where(sender => sender.IsBlocked)
                .Select(sender => sender.SenderEtld1)
                .ToArray();

            try
            {
                await kvWriter.PutAsync(
                    alias.FullAddress.ToLowerInvariant(),
                    AliasKvRecord.Serialize(
                        destination,
                        alias.Status.ToString().ToLowerInvariant(),
                        userId,
                        blockedSenders),
                    cancellationToken);
            }
            catch
            {
                await aliases.MarkKvDirtyAsync(alias.Id, cancellationToken);
            }
        }
    }
}
