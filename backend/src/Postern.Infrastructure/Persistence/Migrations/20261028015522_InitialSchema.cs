using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "postern");

            migrationBuilder.CreateTable(
                name: "invite_codes",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    used_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invite_codes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    normalized_email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    password_hash = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    recovery_key_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    is_admin = table.Column<bool>(type: "boolean", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    invite_code_used_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                    table.CheckConstraint("ck_users_status", "status IN ('pending', 'active', 'suspended')");
                    table.ForeignKey(
                        name: "fk_users_invite_codes_invite_code_used_id",
                        column: x => x.invite_code_used_id,
                        principalSchema: "postern",
                        principalTable: "invite_codes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "admin_audit_log",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    admin_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    target_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    metadata = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_admin_audit_log", x => x.id);
                    table.ForeignKey(
                        name: "fk_admin_audit_log_users_admin_user_id",
                        column: x => x.admin_user_id,
                        principalSchema: "postern",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "aliases",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    label = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    random_suffix = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    full_address = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    full_address_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    purpose_metadata = table.Column<string>(type: "jsonb", nullable: true),
                    category = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    replaced_by_alias_id = table.Column<Guid>(type: "uuid", nullable: true),
                    kv_dirty = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_aliases", x => x.id);
                    table.CheckConstraint("ck_aliases_deleted_at", "(status = 'deleted' AND deleted_at IS NOT NULL) OR (status <> 'deleted' AND deleted_at IS NULL)");
                    table.CheckConstraint("ck_aliases_status", "status IN ('active', 'disabled', 'replaced', 'deleted')");
                    table.CheckConstraint("ck_aliases_tombstone_shape", "status = 'deleted' OR (user_id IS NOT NULL AND label IS NOT NULL AND random_suffix IS NOT NULL AND full_address IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_aliases_aliases_replaced_by_alias_id",
                        column: x => x.replaced_by_alias_id,
                        principalSchema: "postern",
                        principalTable: "aliases",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_aliases_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "postern",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "global_blocklist",
                schema: "postern",
                columns: table => new
                {
                    domain_etld1 = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    added_by_admin_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reason = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_global_blocklist", x => x.domain_etld1);
                    table.ForeignKey(
                        name: "fk_global_blocklist_users_added_by_admin_user_id",
                        column: x => x.added_by_admin_user_id,
                        principalSchema: "postern",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "blocked_messages",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    alias_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_header = table.Column<string>(type: "character varying(998)", maxLength: 998, nullable: false),
                    subject = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    reason = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_blocked_messages", x => x.id);
                    table.CheckConstraint("ck_blocked_messages_subject_length", "subject IS NULL OR char_length(subject) <= 60");
                    table.ForeignKey(
                        name: "fk_blocked_messages_aliases_alias_id",
                        column: x => x.alias_id,
                        principalSchema: "postern",
                        principalTable: "aliases",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "expected_senders",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    alias_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sender_etld1 = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expected_senders", x => x.id);
                    table.ForeignKey(
                        name: "fk_expected_senders_aliases_alias_id",
                        column: x => x.alias_id,
                        principalSchema: "postern",
                        principalTable: "aliases",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "messages",
                schema: "postern",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    alias_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_header = table.Column<string>(type: "character varying(998)", maxLength: 998, nullable: false),
                    envelope_sender = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    subject = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    authentication_result = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    is_flagged = table.Column<bool>(type: "boolean", nullable: false),
                    flag_reason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messages", x => x.id);
                    table.CheckConstraint("ck_messages_authentication_result", "authentication_result IN ('pass', 'none', 'fail', 'unknown')");
                    table.CheckConstraint("ck_messages_subject_length", "subject IS NULL OR char_length(subject) <= 60");
                    table.ForeignKey(
                        name: "fk_messages_aliases_alias_id",
                        column: x => x.alias_id,
                        principalSchema: "postern",
                        principalTable: "aliases",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_admin_audit_log_admin_user_id",
                schema: "postern",
                table: "admin_audit_log",
                column: "admin_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_admin_audit_log_created_at",
                schema: "postern",
                table: "admin_audit_log",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_aliases_replaced_by_alias_id",
                schema: "postern",
                table: "aliases",
                column: "replaced_by_alias_id");

            migrationBuilder.CreateIndex(
                name: "ix_aliases_user_id_status",
                schema: "postern",
                table: "aliases",
                columns: new[] { "user_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ux_aliases_full_address_hash",
                schema: "postern",
                table: "aliases",
                column: "full_address_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_blocked_messages_alias_id_received_at",
                schema: "postern",
                table: "blocked_messages",
                columns: new[] { "alias_id", "received_at" });

            migrationBuilder.CreateIndex(
                name: "ux_expected_senders_alias_id_sender_etld1",
                schema: "postern",
                table: "expected_senders",
                columns: new[] { "alias_id", "sender_etld1" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_global_blocklist_added_by_admin_user_id",
                schema: "postern",
                table: "global_blocklist",
                column: "added_by_admin_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_invite_codes_code_hash",
                schema: "postern",
                table: "invite_codes",
                column: "code_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_messages_alias_id_received_at",
                schema: "postern",
                table: "messages",
                columns: new[] { "alias_id", "received_at" });

            migrationBuilder.CreateIndex(
                name: "IX_users_invite_code_used_id",
                schema: "postern",
                table: "users",
                column: "invite_code_used_id");

            migrationBuilder.CreateIndex(
                name: "ux_users_normalized_email",
                schema: "postern",
                table: "users",
                column: "normalized_email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "admin_audit_log",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "blocked_messages",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "expected_senders",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "global_blocklist",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "messages",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "aliases",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "users",
                schema: "postern");

            migrationBuilder.DropTable(
                name: "invite_codes",
                schema: "postern");
        }
    }
}
