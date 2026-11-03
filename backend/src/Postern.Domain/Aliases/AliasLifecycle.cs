namespace Postern.Domain.Aliases;

public static class AliasLifecycle
{
    public static bool CanTransition(AliasStatus current, AliasStatus next) =>
        (current, next) switch
        {
            (AliasStatus.Active, AliasStatus.Disabled) => true,
            (AliasStatus.Disabled, AliasStatus.Active) => true,
            (AliasStatus.Active, AliasStatus.Replaced) => true,
            (AliasStatus.Active or AliasStatus.Disabled or AliasStatus.Replaced, AliasStatus.Deleted) => true,
            _ => false
        };
}
