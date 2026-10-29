using Postern.Application.Integrations;

namespace Postern.Application.Accounts;

public sealed class AccountManagementService(
    IAccountRepository accounts,
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

        try
        {
            await destinations.RemoveAsync(user.Email, cancellationToken);
        }
        catch
        {
        }

        try
        {
            await destinations.AddAsync(newForwardingAddress.Trim(), cancellationToken);
        }
        catch
        {
            return false;
        }

        return await accounts.UpdateForwardingAddressAsync(userId, newForwardingAddress.Trim(), cancellationToken);
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
            await destinations.RemoveAsync(user.Email, cancellationToken);
        }
        catch
        {
        }

        return await accounts.DeleteAccountAsync(userId, timeProvider.GetUtcNow(), cancellationToken);
    }
}
