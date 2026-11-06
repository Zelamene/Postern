using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;

namespace Postern.Api.Workers;

public sealed class InviteEmailOutboxWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    TimeProvider timeProvider,
    ILogger<InviteEmailOutboxWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan MessageLease = TimeSpan.FromMinutes(2);
    private const int MaximumAttempts = 8;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var repository = scope.ServiceProvider.GetRequiredService<IInviteRepository>();
                var message = await repository.ClaimNextOutboxMessageAsync(
                    timeProvider.GetUtcNow(),
                    timeProvider.GetUtcNow().Add(MessageLease),
                    stoppingToken);

                if (message is null)
                {
                    await Task.Delay(PollInterval, stoppingToken);
                    continue;
                }

                await ProcessMessageAsync(scope.ServiceProvider, repository, message, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Invite email outbox worker failed to claim or process a message.");
                await Task.Delay(PollInterval, stoppingToken);
            }
        }
    }

    private async Task ProcessMessageAsync(
        IServiceProvider services,
        IInviteRepository repository,
        InviteEmailOutboxMessage message,
        CancellationToken cancellationToken)
    {
        try
        {
            var protector = services.GetRequiredService<IInviteCodeProtector>();
            var sender = services.GetRequiredService<IInviteEmailSender>();
            var publicBaseUrl = configuration["Invites:PublicBaseUrl"]
                ?? throw new InvalidOperationException("Invites:PublicBaseUrl is not configured.");
            var inviteCode = protector.Unprotect(message.ProtectedInviteCode);
            var providerMessageId = await sender.SendAsync(
                new InviteEmail(
                    message.RecipientEmail,
                    inviteCode,
                    message.InviterName,
                    message.ExpiresAt,
                    publicBaseUrl),
                message.Id,
                cancellationToken);

            await repository.MarkOutboxMessageSentAsync(
                message.Id,
                providerMessageId,
                timeProvider.GetUtcNow(),
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            var permanentlyFailed = message.AttemptCount >= MaximumAttempts;
            var retryDelaySeconds = Math.Min(3600, 30 * Math.Pow(2, Math.Max(0, message.AttemptCount - 1)));
            var nextAttemptAt = timeProvider.GetUtcNow().AddSeconds(retryDelaySeconds);

            logger.LogError(
                exception,
                "Invite email delivery failed for outbox message {OutboxMessageId} on attempt {AttemptCount}.",
                message.Id,
                message.AttemptCount);

            await repository.ScheduleOutboxRetryAsync(
                message.Id,
                nextAttemptAt,
                exception.GetType().Name,
                permanentlyFailed,
                cancellationToken);
        }
    }
}
