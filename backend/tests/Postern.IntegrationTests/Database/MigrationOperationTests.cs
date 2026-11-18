using Microsoft.EntityFrameworkCore.Migrations;
using Postern.Infrastructure.Persistence.Migrations;

namespace Postern.IntegrationTests.Database;

/// <summary>
/// Migration Up/Down bodies are executable schema code. Applying migrations to an
/// already-migrated test database skips those bodies, so build the operation lists
/// directly. This keeps the hand-written migration code covered without requiring a
/// fresh database per migration; the resulting schema is verified separately by
/// DatabaseSchemaTests against a real database.
/// </summary>
public sealed class MigrationOperationTests
{
    [Fact]
    public void SchemaMigrations_BuildTheirUpAndDownOperations()
    {
        Migration[] migrations =
        [
            new AddBlockedSenders(),
            new AddDataProtectionKeys(),
            new AddExpectedSenderScope(),
            new ProtectAdminAuditLog(),
        ];

        foreach (var migration in migrations)
        {
            migration.ActiveProvider = "Npgsql.EntityFrameworkCore.PostgreSQL";

            var up = migration.UpOperations;
            var down = migration.DownOperations;

            Assert.NotNull(up);
            Assert.NotNull(down);
        }
    }
}
