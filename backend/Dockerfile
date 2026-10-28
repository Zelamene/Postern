FROM mcr.microsoft.com/dotnet/sdk:10.0

WORKDIR /workspace
COPY --chown=10001:10001 src/Postern.Api/Postern.Api.csproj ./src/Postern.Api/Postern.Api.csproj
COPY --chown=10001:10001 src/Postern.Api/appsettings.json ./src/Postern.Api/appsettings.json
COPY --chown=10001:10001 src/Postern.Api/appsettings.Development.json ./src/Postern.Api/appsettings.Development.json
COPY --chown=10001:10001 src/Postern.Api/Program.cs ./src/Postern.Api/Program.cs
COPY --chown=10001:10001 src/Postern.Application/Postern.Application.csproj ./src/Postern.Application/Postern.Application.csproj
COPY --chown=10001:10001 src/Postern.Application/Integrations/IDestinationService.cs ./src/Postern.Application/Integrations/IDestinationService.cs
COPY --chown=10001:10001 src/Postern.Application/Integrations/IKvWriter.cs ./src/Postern.Application/Integrations/IKvWriter.cs
COPY --chown=10001:10001 src/Postern.Infrastructure/Postern.Infrastructure.csproj ./src/Postern.Infrastructure/Postern.Infrastructure.csproj
COPY --chown=10001:10001 src/Postern.Infrastructure/Persistence/PosternDbContext.cs ./src/Postern.Infrastructure/Persistence/PosternDbContext.cs
COPY --chown=10001:10001 src/Postern.Infrastructure/Persistence/PosternDesignTimeDbContextFactory.cs ./src/Postern.Infrastructure/Persistence/PosternDesignTimeDbContextFactory.cs
COPY --chown=10001:10001 src/Postern.Infrastructure/Persistence/Migrations/20261028015522_InitialSchema.cs ./src/Postern.Infrastructure/Persistence/Migrations/20261028015522_InitialSchema.cs
COPY --chown=10001:10001 src/Postern.Infrastructure/Persistence/Migrations/20261028015522_InitialSchema.Designer.cs ./src/Postern.Infrastructure/Persistence/Migrations/20261028015522_InitialSchema.Designer.cs
COPY --chown=10001:10001 src/Postern.Infrastructure/Persistence/Migrations/PosternDbContextModelSnapshot.cs ./src/Postern.Infrastructure/Persistence/Migrations/PosternDbContextModelSnapshot.cs
COPY --chown=10001:10001 src/Postern.Domain/Postern.Domain.csproj ./src/Postern.Domain/Postern.Domain.csproj
COPY --chown=10001:10001 src/Postern.Domain/Accounts/InviteCode.cs ./src/Postern.Domain/Accounts/InviteCode.cs
COPY --chown=10001:10001 src/Postern.Domain/Accounts/PosternUser.cs ./src/Postern.Domain/Accounts/PosternUser.cs
COPY --chown=10001:10001 src/Postern.Domain/Activity/BlockedMessage.cs ./src/Postern.Domain/Activity/BlockedMessage.cs
COPY --chown=10001:10001 src/Postern.Domain/Activity/Message.cs ./src/Postern.Domain/Activity/Message.cs
COPY --chown=10001:10001 src/Postern.Domain/Administration/AdminAuditLogEntry.cs ./src/Postern.Domain/Administration/AdminAuditLogEntry.cs
COPY --chown=10001:10001 src/Postern.Domain/Administration/GlobalBlockedDomain.cs ./src/Postern.Domain/Administration/GlobalBlockedDomain.cs
COPY --chown=10001:10001 src/Postern.Domain/Aliases/Alias.cs ./src/Postern.Domain/Aliases/Alias.cs
COPY --chown=10001:10001 src/Postern.Domain/Aliases/AliasLifecycle.cs ./src/Postern.Domain/Aliases/AliasLifecycle.cs
COPY --chown=10001:10001 src/Postern.Domain/Aliases/AliasStatus.cs ./src/Postern.Domain/Aliases/AliasStatus.cs
COPY --chown=10001:10001 src/Postern.Domain/Aliases/ExpectedSender.cs ./src/Postern.Domain/Aliases/ExpectedSender.cs

RUN mkdir -p /tmp/dotnet-home \
    /workspace/src/Postern.Api/bin /workspace/src/Postern.Api/obj \
    /workspace/src/Postern.Application/bin /workspace/src/Postern.Application/obj \
    /workspace/src/Postern.Domain/bin /workspace/src/Postern.Domain/obj \
    /workspace/src/Postern.Infrastructure/bin /workspace/src/Postern.Infrastructure/obj \
    && chown 10001:10001 /tmp/dotnet-home \
    /workspace/src/Postern.Api/bin /workspace/src/Postern.Api/obj \
    /workspace/src/Postern.Application/bin /workspace/src/Postern.Application/obj \
    /workspace/src/Postern.Domain/bin /workspace/src/Postern.Domain/obj \
    /workspace/src/Postern.Infrastructure/bin /workspace/src/Postern.Infrastructure/obj \
    && chown 10001:10001 /workspace

ENV HOME=/tmp/dotnet-home \
    DOTNET_CLI_HOME=/tmp/dotnet-home \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

USER 10001:10001

EXPOSE 8080

CMD ["dotnet", "watch", "--project", "src/Postern.Api/Postern.Api.csproj", "run", "--no-launch-profile", "--urls", "http://0.0.0.0:8080"]
