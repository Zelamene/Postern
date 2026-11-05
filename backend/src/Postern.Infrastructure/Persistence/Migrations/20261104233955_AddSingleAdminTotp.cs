using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSingleAdminTotp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "admin_mfa_challenge_expires_at",
                schema: "postern",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "admin_mfa_challenge_hash",
                schema: "postern",
                table: "users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "admin_mfa_challenge_purpose",
                schema: "postern",
                table: "users",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "admin_totp_enabled_at",
                schema: "postern",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "admin_totp_last_used_step",
                schema: "postern",
                table: "users",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "admin_totp_secret_protected",
                schema: "postern",
                table: "users",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_users_single_admin",
                schema: "postern",
                table: "users",
                column: "is_admin",
                unique: true,
                filter: "is_admin = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_users_single_admin",
                schema: "postern",
                table: "users");

            migrationBuilder.DropColumn(
                name: "admin_mfa_challenge_expires_at",
                schema: "postern",
                table: "users");

            migrationBuilder.DropColumn(
                name: "admin_mfa_challenge_hash",
                schema: "postern",
                table: "users");

            migrationBuilder.DropColumn(
                name: "admin_mfa_challenge_purpose",
                schema: "postern",
                table: "users");

            migrationBuilder.DropColumn(
                name: "admin_totp_enabled_at",
                schema: "postern",
                table: "users");

            migrationBuilder.DropColumn(
                name: "admin_totp_last_used_step",
                schema: "postern",
                table: "users");

            migrationBuilder.DropColumn(
                name: "admin_totp_secret_protected",
                schema: "postern",
                table: "users");
        }
    }
}
