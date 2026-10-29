using Microsoft.EntityFrameworkCore;
using Postern.Domain.Accounts;
using Postern.Domain.Activity;
using Postern.Domain.Administration;
using Postern.Domain.Aliases;

namespace Postern.Infrastructure.Persistence;

public sealed class PosternDbContext(DbContextOptions<PosternDbContext> options) : DbContext(options)
{
    public DbSet<PosternUser> Users => Set<PosternUser>();
    public DbSet<Alias> Aliases => Set<Alias>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<ExpectedSender> ExpectedSenders => Set<ExpectedSender>();
    public DbSet<BlockedMessage> BlockedMessages => Set<BlockedMessage>();
    public DbSet<InviteCode> InviteCodes => Set<InviteCode>();
    public DbSet<AdminAuditLogEntry> AdminAuditLog => Set<AdminAuditLogEntry>();
    public DbSet<GlobalBlockedDomain> GlobalBlocklist => Set<GlobalBlockedDomain>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("postern");

        modelBuilder.Entity<PosternUser>(entity =>
        {
            entity.ToTable("users", table =>
                table.HasCheckConstraint("ck_users_status", "status IN ('pending', 'active', 'suspended')"));
            entity.HasKey(user => user.Id);
            entity.Property(user => user.Id).HasColumnName("id");
            entity.Property(user => user.Email).HasColumnName("email").HasMaxLength(320).IsRequired();
            entity.Property(user => user.NormalizedEmail).HasColumnName("normalized_email").HasMaxLength(320).IsRequired();
            entity.Property(user => user.ForwardingAddress).HasColumnName("forwarding_address").HasMaxLength(320);
            entity.Property(user => user.PasswordHash).HasColumnName("password_hash").HasMaxLength(512).IsRequired();
            entity.Property(user => user.RecoveryKeyHash).HasColumnName("recovery_key_hash").HasMaxLength(256);
            entity.Property(user => user.IsAdmin).HasColumnName("is_admin");
            entity.Property(user => user.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
            entity.Property(user => user.InviteCodeUsedId).HasColumnName("invite_code_used_id");
            entity.Property(user => user.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(user => user.NormalizedEmail).IsUnique().HasDatabaseName("ux_users_normalized_email");
            entity.HasIndex(user => user.RecoveryKeyHash)
                .IsUnique()
                .HasFilter("recovery_key_hash IS NOT NULL")
                .HasDatabaseName("ux_users_recovery_key_hash");
            entity.HasOne<InviteCode>()
                .WithMany()
                .HasForeignKey(user => user.InviteCodeUsedId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_users_invite_codes_invite_code_used_id");
        });

        modelBuilder.Entity<InviteCode>(entity =>
        {
            entity.ToTable("invite_codes");
            entity.HasKey(invite => invite.Id);
            entity.Property(invite => invite.Id).HasColumnName("id");
            entity.Property(invite => invite.CodeHash).HasColumnName("code_hash").HasMaxLength(128).IsRequired();
            entity.Property(invite => invite.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(invite => invite.ExpiresAt).HasColumnName("expires_at").HasColumnType("timestamp with time zone");
            entity.Property(invite => invite.UsedAt).HasColumnName("used_at").HasColumnType("timestamp with time zone");
            entity.Property(invite => invite.UsedByUserId).HasColumnName("used_by_user_id");
            entity.HasIndex(invite => invite.CodeHash).IsUnique().HasDatabaseName("ux_invite_codes_code_hash");
        });

        modelBuilder.Entity<Alias>(entity =>
        {
            entity.ToTable("aliases", table =>
            {
                table.HasCheckConstraint("ck_aliases_status", "status IN ('active', 'disabled', 'replaced', 'deleted')");
                table.HasCheckConstraint(
                    "ck_aliases_tombstone_shape",
                    "status = 'deleted' OR (user_id IS NOT NULL AND label IS NOT NULL AND random_suffix IS NOT NULL AND full_address IS NOT NULL)");
                table.HasCheckConstraint(
                    "ck_aliases_deleted_at",
                    "(status = 'deleted' AND deleted_at IS NOT NULL) OR (status <> 'deleted' AND deleted_at IS NULL)");
            });
            entity.HasKey(alias => alias.Id);
            entity.Property(alias => alias.Id).HasColumnName("id");
            entity.Property(alias => alias.UserId).HasColumnName("user_id");
            entity.Property(alias => alias.Label).HasColumnName("label").HasMaxLength(64);
            entity.Property(alias => alias.RandomSuffix).HasColumnName("random_suffix").HasMaxLength(8);
            entity.Property(alias => alias.FullAddress).HasColumnName("full_address").HasMaxLength(320);
            entity.Property(alias => alias.FullAddressHash).HasColumnName("full_address_hash").HasMaxLength(64).IsRequired();
            entity.Property(alias => alias.PurposeMetadata).HasColumnName("purpose_metadata").HasColumnType("jsonb");
            entity.Property(alias => alias.Category).HasColumnName("category").HasMaxLength(64);
            entity.Property(alias => alias.Status)
                .HasColumnName("status")
                .HasConversion(
                    status => status.ToString().ToLowerInvariant(),
                    status => Enum.Parse<AliasStatus>(status, ignoreCase: true))
                .HasMaxLength(16)
                .IsRequired();
            entity.Property(alias => alias.ReplacedByAliasId).HasColumnName("replaced_by_alias_id");
            entity.Property(alias => alias.KvDirty).HasColumnName("kv_dirty");
            entity.Property(alias => alias.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(alias => alias.DeletedAt).HasColumnName("deleted_at").HasColumnType("timestamp with time zone");
            entity.HasIndex(alias => alias.FullAddressHash).IsUnique().HasDatabaseName("ux_aliases_full_address_hash");
            entity.HasIndex(alias => new { alias.UserId, alias.Status }).HasDatabaseName("ix_aliases_user_id_status");
            entity.HasOne(alias => alias.User)
                .WithMany(user => user.Aliases)
                .HasForeignKey(alias => alias.UserId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_aliases_users_user_id");
            entity.HasOne<Alias>()
                .WithMany()
                .HasForeignKey(alias => alias.ReplacedByAliasId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_aliases_aliases_replaced_by_alias_id");
        });

        modelBuilder.Entity<Message>(entity =>
        {
            entity.ToTable("messages", table =>
            {
                table.HasCheckConstraint("ck_messages_subject_length", "subject IS NULL OR char_length(subject) <= 60");
                table.HasCheckConstraint("ck_messages_authentication_result", "authentication_result IN ('pass', 'none', 'fail', 'unknown')");
            });
            entity.HasKey(message => message.Id);
            entity.Property(message => message.Id).HasColumnName("id");
            entity.Property(message => message.AliasId).HasColumnName("alias_id");
            entity.Property(message => message.FromHeader).HasColumnName("from_header").HasMaxLength(998).IsRequired();
            entity.Property(message => message.EnvelopeSender).HasColumnName("envelope_sender").HasMaxLength(320).IsRequired();
            entity.Property(message => message.Subject).HasColumnName("subject").HasMaxLength(60);
            entity.Property(message => message.ReceivedAt).HasColumnName("received_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(message => message.AuthenticationResult).HasColumnName("authentication_result").HasMaxLength(16).IsRequired();
            entity.Property(message => message.IsFlagged).HasColumnName("is_flagged");
            entity.Property(message => message.FlagReason).HasColumnName("flag_reason").HasMaxLength(64);
            entity.HasIndex(message => new { message.AliasId, message.ReceivedAt }).HasDatabaseName("ix_messages_alias_id_received_at");
            entity.HasOne(message => message.Alias)
                .WithMany(alias => alias.Messages)
                .HasForeignKey(message => message.AliasId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("fk_messages_aliases_alias_id");
        });

        modelBuilder.Entity<ExpectedSender>(entity =>
        {
            entity.ToTable("expected_senders");
            entity.HasKey(sender => sender.Id);
            entity.Property(sender => sender.Id).HasColumnName("id");
            entity.Property(sender => sender.AliasId).HasColumnName("alias_id");
            entity.Property(sender => sender.SenderEtld1).HasColumnName("sender_etld1").HasMaxLength(253).IsRequired();
            entity.Property(sender => sender.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(sender => new { sender.AliasId, sender.SenderEtld1 }).IsUnique().HasDatabaseName("ux_expected_senders_alias_id_sender_etld1");
            entity.HasOne(sender => sender.Alias)
                .WithMany(alias => alias.ExpectedSenders)
                .HasForeignKey(sender => sender.AliasId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("fk_expected_senders_aliases_alias_id");
        });

        modelBuilder.Entity<BlockedMessage>(entity =>
        {
            entity.ToTable("blocked_messages", table =>
                table.HasCheckConstraint("ck_blocked_messages_subject_length", "subject IS NULL OR char_length(subject) <= 60"));
            entity.HasKey(message => message.Id);
            entity.Property(message => message.Id).HasColumnName("id");
            entity.Property(message => message.AliasId).HasColumnName("alias_id");
            entity.Property(message => message.FromHeader).HasColumnName("from_header").HasMaxLength(998).IsRequired();
            entity.Property(message => message.Subject).HasColumnName("subject").HasMaxLength(60);
            entity.Property(message => message.ReceivedAt).HasColumnName("received_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(message => message.Reason).HasColumnName("reason").HasMaxLength(32).IsRequired();
            entity.HasIndex(message => new { message.AliasId, message.ReceivedAt }).HasDatabaseName("ix_blocked_messages_alias_id_received_at");
            entity.HasOne(message => message.Alias)
                .WithMany(alias => alias.BlockedMessages)
                .HasForeignKey(message => message.AliasId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("fk_blocked_messages_aliases_alias_id");
        });

        modelBuilder.Entity<AdminAuditLogEntry>(entity =>
        {
            entity.ToTable("admin_audit_log");
            entity.HasKey(entry => entry.Id);
            entity.Property(entry => entry.Id).HasColumnName("id");
            entity.Property(entry => entry.AdminUserId).HasColumnName("admin_user_id");
            entity.Property(entry => entry.Action).HasColumnName("action").HasMaxLength(80).IsRequired();
            entity.Property(entry => entry.TargetId).HasColumnName("target_id").HasMaxLength(128);
            entity.Property(entry => entry.Metadata).HasColumnName("metadata").HasColumnType("jsonb");
            entity.Property(entry => entry.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(entry => entry.CreatedAt).HasDatabaseName("ix_admin_audit_log_created_at");
            entity.HasOne<PosternUser>()
                .WithMany()
                .HasForeignKey(entry => entry.AdminUserId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_admin_audit_log_users_admin_user_id");
        });

        modelBuilder.Entity<GlobalBlockedDomain>(entity =>
        {
            entity.ToTable("global_blocklist");
            entity.HasKey(domain => domain.DomainEtld1);
            entity.Property(domain => domain.DomainEtld1).HasColumnName("domain_etld1").HasMaxLength(253);
            entity.Property(domain => domain.AddedByAdminUserId).HasColumnName("added_by_admin_user_id");
            entity.Property(domain => domain.Reason).HasColumnName("reason").HasMaxLength(256).IsRequired();
            entity.Property(domain => domain.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasOne<PosternUser>()
                .WithMany()
                .HasForeignKey(domain => domain.AddedByAdminUserId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_global_blocklist_users_added_by_admin_user_id");
        });
    }

    public static void ConfigureNpgsql(DbContextOptionsBuilder options, string connectionString)
    {
        options.UseNpgsql(
            connectionString,
            postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "postern"));
    }
}
