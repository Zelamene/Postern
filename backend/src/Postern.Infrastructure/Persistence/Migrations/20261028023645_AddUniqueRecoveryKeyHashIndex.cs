using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueRecoveryKeyHashIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ux_users_recovery_key_hash",
                schema: "postern",
                table: "users",
                column: "recovery_key_hash",
                unique: true,
                filter: "recovery_key_hash IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_users_recovery_key_hash",
                schema: "postern",
                table: "users");
        }
    }
}
