using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notifications",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    audience = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    recipient_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    kind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    body = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    link = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    read_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.id);
                    table.CheckConstraint("ck_notifications_audience", "audience IN ('user', 'admin')");
                    table.ForeignKey(
                        name: "fk_notifications_users_recipient_user_id",
                        column: x => x.recipient_user_id,
                        principalSchema: "postern",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_audience_recipient_created_at",
                schema: "postern",
                table: "notifications",
                columns: new[] { "audience", "recipient_user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_notifications_recipient_user_id",
                schema: "postern",
                table: "notifications",
                column: "recipient_user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notifications",
                schema: "postern");
        }
    }
}
