using Microsoft.EntityFrameworkCore;
using Npgsql;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Database;

/// <summary>
/// QR1.4: the mail tables store metadata only. These assertions run against the
/// migrated database, not the EF model, so a missing or stale migration fails here.
/// The body-column check is scoped to messages and blocked_messages on purpose:
/// notifications.body is in-app notification text, not mail content.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class DatabaseSchemaTests(PosternFixture fixture)
{
    [Fact]
    public async Task MailTables_CarryNoBodyColumns()
    {
        await using var db = fixture.CreateContext();

        var columns = await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT column_name AS "Value"
                FROM information_schema.columns
                WHERE table_schema = 'postern'
                  AND table_name IN ('messages', 'blocked_messages')
                  AND column_name IN ('body', 'body_html', 'body_text', 'content', 'html', 'raw', 'text')
                ORDER BY column_name
                """)
            .ToListAsync();

        Assert.Empty(columns);
    }

    [Fact]
    public async Task SubjectColumns_AreCappedAtSixtyCharacters()
    {
        await using var db = fixture.CreateContext();

        var lengths = await db.Database
            .SqlQueryRaw<int>(
                """
                SELECT character_maximum_length AS "Value"
                FROM information_schema.columns
                WHERE table_schema = 'postern'
                  AND table_name IN ('messages', 'blocked_messages')
                  AND column_name = 'subject'
                """)
            .ToListAsync();

        Assert.Equal(2, lengths.Count);
        Assert.All(lengths, length => Assert.Equal(60, length));
    }

    [Fact]
    public async Task SubjectLength_IsEnforcedByNamedConstraints()
    {
        await using var db = fixture.CreateContext();

        var constraints = await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT conname || ' ' || pg_get_constraintdef(oid) AS "Value"
                FROM pg_constraint
                WHERE conrelid IN ('postern.messages'::regclass, 'postern.blocked_messages'::regclass)
                  AND contype = 'c'
                  AND conname IN ('ck_messages_subject_length', 'ck_blocked_messages_subject_length')
                ORDER BY conname
                """)
            .ToListAsync();

        Assert.Equal(2, constraints.Count);
        Assert.StartsWith("ck_blocked_messages_subject_length CHECK", constraints[0]);
        Assert.StartsWith("ck_messages_subject_length CHECK", constraints[1]);
        Assert.All(constraints, constraint =>
        {
            // PostgreSQL renders the definition as char_length((subject)::text).
            Assert.Contains("char_length", constraint);
            Assert.Contains("60", constraint);
        });
    }

    [Fact]
    public async Task OverlongSubject_IsRejectedByTheDatabase()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var overlong = new string('s', 61);
        await using var db = fixture.CreateContext();

        // The varchar(60) column rejects the value before the CHECK runs, so the
        // observed state is string truncation rather than a check violation. Both
        // layers exist deliberately; the named-constraint test above proves the
        // CHECK is present, and this proves the insert cannot succeed.
        var messagesFailure = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                 INSERT INTO postern.messages (id, alias_id, from_header, envelope_sender, subject, received_at, authentication_result, is_flagged)
                 VALUES ({Guid.NewGuid()}, {alias.Id}, {"Shop <orders@shop.example>"}, {"orders@shop.example"}, {overlong}, now(), {"pass"}, false)
                 """));
        Assert.Equal(PostgresErrorCodes.StringDataRightTruncation, messagesFailure.SqlState);

        var blockedFailure = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                 INSERT INTO postern.blocked_messages (id, alias_id, from_header, subject, received_at, reason)
                 VALUES ({Guid.NewGuid()}, {alias.Id}, {"Phish <security@phish.example>"}, {overlong}, now(), {"blocked_sender"})
                 """));
        Assert.Equal(PostgresErrorCodes.StringDataRightTruncation, blockedFailure.SqlState);
    }

    [Fact]
    public async Task EveryModelMigration_HasBeenApplied()
    {
        await using var db = fixture.CreateContext();

        var modelMigrations = db.Database.GetMigrations().Order().ToArray();
        var applied = (await db.Database.GetAppliedMigrationsAsync()).Order().ToArray();

        Assert.Equal(modelMigrations, applied);
    }
}
