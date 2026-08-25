export function findMostSpecificActivePath(
  pathname: string,
  routePaths: string[],
): string | null {
  let activePath: string | null = null;

  for (const routePath of routePaths) {
    const matches =
      pathname === routePath ||
      (routePath !== "/" && pathname.startsWith(`${routePath}/`));

    if (!matches) continue;
    if (activePath === null || routePath.length > activePath.length) {
      activePath = routePath;
    }
  }

  return activePath;
}
