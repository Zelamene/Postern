FROM mcr.microsoft.com/dotnet/sdk:10.0

WORKDIR /workspace
COPY --chown=10001:10001 src/Postern.Api/Postern.Api.csproj ./src/Postern.Api/Postern.Api.csproj
COPY --chown=10001:10001 src/Postern.Api/Program.cs ./src/Postern.Api/Program.cs
COPY --chown=10001:10001 src/Postern.Domain/Postern.Domain.csproj ./src/Postern.Domain/Postern.Domain.csproj
COPY --chown=10001:10001 src/Postern.Domain/Aliases/AliasStatus.cs ./src/Postern.Domain/Aliases/AliasStatus.cs
COPY --chown=10001:10001 src/Postern.Domain/Aliases/AliasLifecycle.cs ./src/Postern.Domain/Aliases/AliasLifecycle.cs

RUN mkdir -p /tmp/dotnet-home \
    && chown 10001:10001 /tmp/dotnet-home \
    && chown 10001:10001 /workspace

ENV HOME=/tmp/dotnet-home \
    DOTNET_CLI_HOME=/tmp/dotnet-home \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

USER 10001:10001

EXPOSE 8080

CMD ["dotnet", "watch", "--project", "src/Postern.Api/Postern.Api.csproj", "run", "--no-launch-profile", "--urls", "http://0.0.0.0:8080"]
