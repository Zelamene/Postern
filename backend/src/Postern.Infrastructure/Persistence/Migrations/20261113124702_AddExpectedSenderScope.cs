using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExpectedSenderScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_expected_senders_alias_id_sender_etld1",
                schema: "postern",
                table: "expected_senders");

            migrationBuilder.AddColumn<string>(
                name: "sender_address",
                schema: "postern",
                table: "expected_senders",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "trust_whole_domain",
                schema: "postern",
                table: "expected_senders",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateIndex(
                name: "ux_expected_senders_alias_id_sender_address",
                schema: "postern",
                table: "expected_senders",
                columns: new[] { "alias_id", "sender_address" },
                unique: true,
                filter: "sender_address IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ux_expected_senders_alias_id_sender_etld1",
                schema: "postern",
                table: "expected_senders",
                columns: new[] { "alias_id", "sender_etld1" },
                unique: true,
                filter: "sender_address IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_expected_senders_alias_id_sender_address",
                schema: "postern",
                table: "expected_senders");

            migrationBuilder.DropIndex(
                name: "ux_expected_senders_alias_id_sender_etld1",
                schema: "postern",
                table: "expected_senders");

            migrationBuilder.DropColumn(
                name: "sender_address",
                schema: "postern",
                table: "expected_senders");

            migrationBuilder.DropColumn(
                name: "trust_whole_domain",
                schema: "postern",
                table: "expected_senders");

            migrationBuilder.CreateIndex(
                name: "ux_expected_senders_alias_id_sender_etld1",
                schema: "postern",
                table: "expected_senders",
                columns: new[] { "alias_id", "sender_etld1" },
                unique: true);
        }
    }
}
