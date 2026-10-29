using Postern.IntegrationTests.Fixtures;
using Xunit;

namespace Postern.IntegrationTests.Collections;

[CollectionDefinition(Name)]
public class DatabaseCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "DatabaseCollection";
}
