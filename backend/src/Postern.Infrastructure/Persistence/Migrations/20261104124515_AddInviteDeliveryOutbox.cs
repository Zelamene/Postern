using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInviteDeliveryOutbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "delivery_message_id",
                schema: "postern",
                table: "invite_codes",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_status",
                schema: "postern",
                table: "invite_codes",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "pending");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "delivery_updated_at",
                schema: "postern",
                table: "invite_codes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "email",
                schema: "postern",
                table: "invite_codes",
                type: "character varying(320)",
                maxLength: 320,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "email_normalized",
                schema: "postern",
                table: "invite_codes",
                type: "character varying(320)",
                maxLength: 320,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "revoked_at",
                schema: "postern",
                table: "invite_codes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "invite_email_outbox",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    invite_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recipient_email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    protected_invite_code = table.Column<string>(type: "text", nullable: false),
                    inviter_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    next_attempt_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    lease_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    provider_message_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invite_email_outbox", x => x.id);
                    table.CheckConstraint("ck_invite_email_outbox_status", "status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')");
                    table.ForeignKey(
                        name: "fk_invite_email_outbox_invite_codes_invite_id",
                        column: x => x.invite_id,
                        principalSchema: "postern",
                        principalTable: "invite_codes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "invite_requests",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    email_normalized = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    reviewed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invite_requests", x => x.id);
                    table.CheckConstraint("ck_invite_requests_status", "status IN ('pending', 'approved', 'rejected')");
                    table.ForeignKey(
                        name: "fk_invite_requests_users_reviewed_by_user_id",
                        column: x => x.reviewed_by_user_id,
                        principalSchema: "postern",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "resend_webhook_events",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    event_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    provider_message_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_resend_webhook_events", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ux_invite_codes_delivery_message_id",
                schema: "postern",
                table: "invite_codes",
                column: "delivery_message_id",
                unique: true,
                filter: "delivery_message_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_invite_codes_delivery_status",
                schema: "postern",
                table: "invite_codes",
                sql: "delivery_status IN ('pending', 'sent', 'delivered', 'bounced', 'complained', 'accepted', 'revoked', 'failed')");

            migrationBuilder.CreateIndex(
                name: "IX_invite_email_outbox_invite_id",
                schema: "postern",
                table: "invite_email_outbox",
                column: "invite_id");

            migrationBuilder.CreateIndex(
                name: "ix_invite_email_outbox_pending",
                schema: "postern",
                table: "invite_email_outbox",
                columns: new[] { "status", "next_attempt_at", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_invite_requests_requested_at",
                schema: "postern",
                table: "invite_requests",
                column: "requested_at");

            migrationBuilder.CreateIndex(
                name: "IX_invite_requests_reviewed_by_user_id",
                schema: "postern",
                table: "invite_requests",
                column: "reviewed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_invite_requests_pending_email",
                schema: "postern",
                table: "invite_requests",
                column: "email_normalized",
                unique: true,
                filter: "status = 'pending'");

            migrationBuilder.CreateIndex(
                name: "ix_resend_webhook_events_received_at",
                schema: "postern",
                table: "resend_webhook_events",
                column: "received_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "invite_email_outbox",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "invite_requests",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "resend_webhook_events",
                schema: "postern");

            migrationBuilder.DropIndex(
                name: "ux_invite_codes_delivery_message_id",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropCheckConstraint(
                name: "ck_invite_codes_delivery_status",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropColumn(
                name: "delivery_message_id",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropColumn(
                name: "delivery_status",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropColumn(
                name: "delivery_updated_at",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropColumn(
                name: "email",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropColumn(
                name: "email_normalized",
                schema: "postern",
                table: "invite_codes");

            migrationBuilder.DropColumn(
                name: "revoked_at",
                schema: "postern",
                table: "invite_codes");
        }
    }
}
