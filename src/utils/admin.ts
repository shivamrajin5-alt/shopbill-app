export const DEVELOPER_ADMIN_PASSWORD = 'adminshiv.developer9142';

export interface ShopOwnerRecord {
  id: string;
  shopId: string; // e.g. 'SB-1001'
  ownerName: string;
  email: string;
  phone: string;
  pin: string;
  pinHash?: string;
  shopName: string;
  address: string;
  gstin?: string;
  registeredAt: string;
  isActive: boolean;
  totalBillsCount: number;
  totalRevenue: number;
}

export interface RegisterShopOwnerInput {
  shopId?: string;
  ownerName: string;
  email: string;
  phone: string;
  pin: string;
  shopName: string;
  address: string;
  gstin?: string;
}

export function verifyDeveloperPassword(password: string): boolean {
  return password.trim() === DEVELOPER_ADMIN_PASSWORD;
}

export function generateShopId(): string {
  return `SB-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function registerShopOwner(
  currentOwners: ShopOwnerRecord[],
  input: RegisterShopOwnerInput
): { owners: ShopOwnerRecord[]; newOwner: ShopOwnerRecord } {
  if (!input.ownerName.trim()) throw new Error('Owner name required');
  if (!input.shopName.trim()) throw new Error('Shop name required');
  if (!input.pin.trim() || input.pin.trim().length !== 4) throw new Error('4-digit PIN required');

  const generatedId = input.shopId?.trim() || generateShopId();

  const newOwner: ShopOwnerRecord = {
    id: generatedId,
    shopId: generatedId,
    ownerName: input.ownerName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    pin: input.pin.trim(),
    shopName: input.shopName.trim(),
    address: input.address.trim(),
    gstin: input.gstin?.trim() || undefined,
    registeredAt: new Date().toISOString(),
    isActive: true,
    totalBillsCount: 0,
    totalRevenue: 0,
  };

  return {
    owners: [newOwner, ...currentOwners],
    newOwner,
  };
}

export function loginWithShopIdAndPin(
  owners: ShopOwnerRecord[],
  shopId: string,
  pin: string
): { success: boolean; shop?: ShopOwnerRecord; error?: string } {
  const cleanId = shopId.trim().toUpperCase();
  const cleanPin = pin.trim();

  if (!cleanId) {
    return { success: false, error: 'Please enter your Shop ID.' };
  }
  if (!cleanPin) {
    return { success: false, error: 'Please enter your 4-digit PIN.' };
  }

  const shop = owners.find(
    (s) => s.shopId.toUpperCase() === cleanId || s.id.toUpperCase() === cleanId
  );

  if (!shop) {
    return {
      success: false,
      error: `Shop ID "${cleanId}" not found. Please check with your administrator.`,
    };
  }

  if (!shop.isActive) {
    return {
      success: false,
      error: `Shop "${shop.shopName}" (${shop.shopId}) has been DEACTIVATED by admin. Access is currently suspended.`,
    };
  }

  if (shop.pin !== cleanPin) {
    return {
      success: false,
      error: `Incorrect 4-digit PIN for Shop ID ${shop.shopId}. Please try again.`,
    };
  }

  return { success: true, shop };
}

export function updateShopOwner(
  currentOwners: ShopOwnerRecord[],
  updated: Partial<ShopOwnerRecord> & { id: string }
): ShopOwnerRecord[] {
  return currentOwners.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
}

export function toggleShopOwnerStatus(
  currentOwners: ShopOwnerRecord[],
  id: string
): ShopOwnerRecord[] {
  return currentOwners.map((o) => (o.id === id ? { ...o, isActive: !o.isActive } : o));
}

export function deleteShopOwner(
  currentOwners: ShopOwnerRecord[],
  id: string
): ShopOwnerRecord[] {
  return currentOwners.filter((o) => o.id !== id);
}

