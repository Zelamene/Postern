using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Postern.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ProtectAdminAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_admin_audit_log_users_admin_user_id",
                schema: "postern",
                table: "admin_audit_log");

            migrationBuilder.DropIndex(
                name: "IX_admin_audit_log_admin_user_id",
                schema: "postern",
                table: "admin_audit_log");


            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION postern.reject_audit_log_mutation()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    RAISE EXCEPTION 'postern.admin_audit_log is append-only: % is not permitted', TG_OP
                        USING ERRCODE = 'insufficient_privilege';
                END;
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_admin_audit_log_append_only
                BEFORE UPDATE OR DELETE ON postern.admin_audit_log
                FOR EACH ROW EXECUTE FUNCTION postern.reject_audit_log_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON postern.admin_audit_log;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS postern.reject_audit_log_mutation();");

            migrationBuilder.CreateIndex(
                name: "IX_admin_audit_log_admin_user_id",
                schema: "postern",
                table: "admin_audit_log",
                column: "admin_user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_admin_audit_log_users_admin_user_id",
                schema: "postern",
                table: "admin_audit_log",
                column: "admin_user_id",
                principalSchema: "postern",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
