FROM mcr.microsoft.com/dotnet/sdk:10.0 AS development

WORKDIR /workspace

ENV HOME=/tmp/dotnet-home \
    DOTNET_CLI_HOME=/tmp/dotnet-home \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

COPY src/ ./src/
RUN dotnet restore src/Postern.Api/Postern.Api.csproj \
    && mkdir -p /workspace/src/Postern.Api/bin /workspace/src/Postern.Application/bin \
        /workspace/src/Postern.Domain/bin /workspace/src/Postern.Infrastructure/bin \
    && chown -R 10001:10001 /tmp/dotnet-home /workspace

USER 10001:10001

EXPOSE 8080

CMD ["dotnet", "watch", "--no-hot-reload", "--project", "src/Postern.Api/Postern.Api.csproj", "run", "--no-launch-profile", "--urls", "http://0.0.0.0:8080"]

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /workspace
COPY src/ ./src/
RUN dotnet publish src/Postern.Api/Postern.Api.csproj \
    --configuration Release \
    --output /published \
    --no-self-contained \
    -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS production

WORKDIR /app
COPY --from=build --chown=10001:10001 /published/ ./

ENV ASPNETCORE_URLS=http://0.0.0.0:8080

USER 10001:10001

EXPOSE 8080

ENTRYPOINT ["dotnet", "Postern.Api.dll"]
