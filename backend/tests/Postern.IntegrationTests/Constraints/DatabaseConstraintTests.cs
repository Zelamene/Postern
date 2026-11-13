using Microsoft.EntityFrameworkCore;
using Npgsql;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Constraints;

[Collection(IntegrationCollection.Name)]
public sealed class DatabaseConstraintTests(PosternFixture fixture)
{
    [Fact]
    public async Task DeleteTombstone_RequiresDeletedAt()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        var tracked = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        tracked.Status = AliasStatus.Deleted;
        tracked.DeletedAt = null;

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ck_aliases_deleted_at");
    }

    [Fact]
    public async Task ActiveAlias_RequiresOwnerAndAddress()
    {
        await using var db = fixture.CreateContext();
        db.Aliases.Add(new Alias
        {
            Id = Guid.NewGuid(),
            UserId = null,
            Label = null,
            RandomSuffix = null,
            FullAddress = null,
            FullAddressHash = Guid.NewGuid().ToString("N"),
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        });

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ck_aliases_tombstone_shape");
    }

    [Fact]
    public async Task AliasStatus_MustBeKnown()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        await using var command = db.Database.GetDbConnection().CreateCommand();
        await db.Database.OpenConnectionAsync();
        command.CommandText =
            "UPDATE postern.aliases SET status = 'archived' WHERE id = @aliasId";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "aliasId";
        parameter.Value = alias.Id;
        command.Parameters.Add(parameter);

        var error = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        Assert.Equal("ck_aliases_status", error.ConstraintName);
    }

    [Fact]
    public async Task FullAddressHash_IsUnique()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        db.Aliases.Add(new Alias
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Label = "duplicate",
            RandomSuffix = "abcd1234",
            FullAddress = $"{Guid.NewGuid():N}@postern.test",
            FullAddressHash = alias.FullAddressHash,
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        });

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ux_aliases_full_address_hash");
    }

    [Fact]
    public async Task MessageSubject_IsLimitedToSixtyCharacters()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        db.Messages.Add(new Message
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            FromHeader = "Shop <orders@shop.example>",
            EnvelopeSender = "orders@shop.example",
            Subject = new string('x', 61),
            ReceivedAt = DateTimeOffset.UtcNow,
            AuthenticationResult = "pass"
        });

        // The column is varchar(60), so the length bound is enforced by the type itself.
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "character varying(60)");
    }

    [Fact]
    public async Task AuthenticationResult_MustBeKnown()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        db.Messages.Add(new Message
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            FromHeader = "Shop <orders@shop.example>",
            EnvelopeSender = "orders@shop.example",
            Subject = "hello",
            ReceivedAt = DateTimeOffset.UtcNow,
            AuthenticationResult = "maybe"
        });

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ck_messages_authentication_result");
    }

    [Fact]
    public async Task DuplicateMessageId_IsRejectedWithinAnAlias()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var messageId = $"<duplicate-{Guid.NewGuid():N}@shop.example>";

        await using var db = fixture.CreateContext();
        db.Messages.AddRange(
            new Message
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = "Shop <orders@shop.example>",
                EnvelopeSender = "orders@shop.example",
                MessageId = messageId,
                Subject = "first",
                ReceivedAt = DateTimeOffset.UtcNow,
                AuthenticationResult = "pass"
            },
            new Message
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = "Shop <orders@shop.example>",
                EnvelopeSender = "orders@shop.example",
                MessageId = messageId,
                Subject = "second",
                ReceivedAt = DateTimeOffset.UtcNow,
                AuthenticationResult = "pass"
            });

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ux_messages_alias_id_message_id");
    }

    [Fact]
    public async Task SameMessageId_IsAllowedAcrossAliases()
    {
        var user = await fixture.AUserAsync();
        var firstAlias = await fixture.AnAliasAsync(user.Id);
        var secondAlias = await fixture.AnAliasAsync(user.Id);
        var messageId = $"<shared-{Guid.NewGuid():N}@shop.example>";

        await using var db = fixture.CreateContext();
        db.Messages.AddRange(
            new Message
            {
                Id = Guid.NewGuid(),
                AliasId = firstAlias.Id,
                FromHeader = "Shop <orders@shop.example>",
                EnvelopeSender = "orders@shop.example",
                MessageId = messageId,
                Subject = "first",
                ReceivedAt = DateTimeOffset.UtcNow,
                AuthenticationResult = "pass"
            },
            new Message
            {
                Id = Guid.NewGuid(),
                AliasId = secondAlias.Id,
                FromHeader = "Shop <orders@shop.example>",
                EnvelopeSender = "orders@shop.example",
                MessageId = messageId,
                Subject = "second",
                ReceivedAt = DateTimeOffset.UtcNow,
                AuthenticationResult = "pass"
            });

        await db.SaveChangesAsync();

        Assert.Equal(2, await db.Messages.CountAsync(message => message.MessageId == messageId));
    }

    [Fact]
    public async Task ExpectedSender_IsUniquePerAlias()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "shop.example",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "shop.example",
            CreatedAt = DateTimeOffset.UtcNow
        });

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ux_expected_senders_alias_id_sender_etld1");
    }

    [Fact]
    public async Task ExpectedSenderAddress_IsUniquePerAlias()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "shop.example",
            SenderAddress = "orders@shop.example",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "shop.example",
            SenderAddress = "orders@shop.example",
            CreatedAt = DateTimeOffset.UtcNow
        });

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        AssertConstraint(error, "ux_expected_senders_alias_id_sender_address");
    }

    [Fact]
    public async Task ExpectedSenderAddress_CoexistsWithDomainRow()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "shop.example",
            TrustWholeDomain = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "shop.example",
            SenderAddress = "orders@shop.example",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        Assert.Equal(2, await db.ExpectedSenders.CountAsync(sender => sender.AliasId == alias.Id));
    }

    private static void AssertConstraint(DbUpdateException error, string expected)
    {
        var text = error.InnerException?.Message ?? error.Message;
        Assert.True(text.Contains(expected, StringComparison.Ordinal), text);
    }
}
