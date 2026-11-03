using Postern.Application.Aliases;
using Postern.Application.Integrations;

namespace Postern.Application.Accounts;

public sealed class AccountManagementService(
    IAccountRepository accounts,
    IAliasRepository aliases,
    IDestinationService destinations,
    IKvWriter kvWriter,
    TimeProvider timeProvider)
{
    public async Task<bool> ChangeForwardingAddressAsync(
        Guid userId,
        string newForwardingAddress,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(newForwardingAddress))
        {
            return false;
        }

        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return false;
        }

        var previousAddress = user.EffectiveForwardingAddress;
        var nextAddress = newForwardingAddress.Trim();

        try
        {
            await destinations.RemoveAsync(previousAddress, cancellationToken);
        }
        catch
        {
        }

        try
        {
            await destinations.AddAsync(nextAddress, cancellationToken);
        }
        catch
        {
            return false;
        }

        if (!await accounts.UpdateForwardingAddressAsync(userId, nextAddress, cancellationToken))
        {
            return false;
        }

        await RepublishAliasesAsync(userId, nextAddress, cancellationToken);
        return true;
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

            try
            {
                await kvWriter.PutAsync(
                    alias.FullAddress.ToLowerInvariant(),
                    AliasKvRecord.Serialize(destination, alias.Status.ToString().ToLowerInvariant(), userId),
                    cancellationToken);
            }
            catch
            {
                await aliases.MarkKvDirtyAsync(alias.Id, cancellationToken);
            }
        }
    }
}
