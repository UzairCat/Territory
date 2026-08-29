export const ADMIN_DISPLAY_NAME = 'Admin';

export function hasAdminDisplayName(name: string): boolean {
  return name.trim().toLocaleLowerCase() === ADMIN_DISPLAY_NAME.toLocaleLowerCase();
}
