using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMessageIdDedupe : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "message_id",
                schema: "postern",
                table: "messages",
                type: "character varying(998)",
                maxLength: 998,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_messages_alias_id_message_id",
                schema: "postern",
                table: "messages",
                columns: new[] { "alias_id", "message_id" },
                unique: true,
                filter: "message_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_messages_alias_id_message_id",
                schema: "postern",
                table: "messages");

            migrationBuilder.DropColumn(
                name: "message_id",
                schema: "postern",
                table: "messages");
        }
    }
}
