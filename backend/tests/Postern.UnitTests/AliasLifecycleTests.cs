using Postern.Domain.Aliases;

namespace Postern.UnitTests;

public class AliasLifecycleTests
{
    [Theory]
    [InlineData(AliasStatus.Active, AliasStatus.Disabled)]
    [InlineData(AliasStatus.Disabled, AliasStatus.Active)]
    [InlineData(AliasStatus.Active, AliasStatus.Replaced)]
    [InlineData(AliasStatus.Active, AliasStatus.Deleted)]
    [InlineData(AliasStatus.Disabled, AliasStatus.Deleted)]
    [InlineData(AliasStatus.Replaced, AliasStatus.Deleted)]
    public void AllowsDefinedTransitions(AliasStatus current, AliasStatus next)
    {
        Assert.True(AliasLifecycle.CanTransition(current, next));
    }

    [Theory]
    [InlineData(AliasStatus.Replaced, AliasStatus.Active)]
    [InlineData(AliasStatus.Replaced, AliasStatus.Disabled)]
    [InlineData(AliasStatus.Deleted, AliasStatus.Active)]
    [InlineData(AliasStatus.Deleted, AliasStatus.Disabled)]
    [InlineData(AliasStatus.Deleted, AliasStatus.Replaced)]
    [InlineData(AliasStatus.Deleted, AliasStatus.Deleted)]
    public void RejectsUndefinedTransitions(AliasStatus current, AliasStatus next)
    {
        Assert.False(AliasLifecycle.CanTransition(current, next));
    }
}
