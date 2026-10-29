namespace Postern.Application.Activity;

public sealed record ActivityPage<T>(IReadOnlyList<T> Items, string? NextCursor);
