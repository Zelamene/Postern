using Postern.IntegrationTests.Fixtures;
using Xunit;

namespace Postern.IntegrationTests.Collections;

[CollectionDefinition(Name)]
public class IntegrationCollection : ICollectionFixture<PosternFixture>
{
    public const string Name = "Integration";
}
