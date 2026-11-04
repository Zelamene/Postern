using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LinkInviteRequestToIssuedInvite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "invite_id",
                schema: "postern",
                table: "invite_requests",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_invite_requests_invite_id",
                schema: "postern",
                table: "invite_requests",
                column: "invite_id");

            migrationBuilder.AddForeignKey(
                name: "fk_invite_requests_invite_codes_invite_id",
                schema: "postern",
                table: "invite_requests",
                column: "invite_id",
                principalSchema: "postern",
                principalTable: "invite_codes",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_invite_requests_invite_codes_invite_id",
                schema: "postern",
                table: "invite_requests");

            migrationBuilder.DropIndex(
                name: "IX_invite_requests_invite_id",
                schema: "postern",
                table: "invite_requests");

            migrationBuilder.DropColumn(
                name: "invite_id",
                schema: "postern",
                table: "invite_requests");
        }
    }
}
