using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Postern.Infrastructure.Persistence;

public sealed class PosternDesignTimeDbContextFactory : IDesignTimeDbContextFactory<PosternDbContext>
{
    public PosternDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("POSTERN_MIGRATOR_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Set POSTERN_MIGRATOR_CONNECTION_STRING to generate or apply database migrations.");
        }

        var options = new DbContextOptionsBuilder<PosternDbContext>();
        PosternDbContext.ConfigureNpgsql(options, connectionString);
        return new PosternDbContext(options.Options);
    }
}
