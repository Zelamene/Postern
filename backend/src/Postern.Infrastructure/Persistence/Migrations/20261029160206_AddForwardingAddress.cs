using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddForwardingAddress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "forwarding_address",
                schema: "postern",
                table: "users",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);


            migrationBuilder.Sql(
                "UPDATE postern.users SET forwarding_address = email WHERE forwarding_address IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "forwarding_address",
                schema: "postern",
                table: "users");
        }
    }
}
