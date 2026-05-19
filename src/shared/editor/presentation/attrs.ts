export interface BlockIdentityProps {
  bid?: string | null;
}

export function bidAttribute(bid: string | null | undefined) {
  return bid ? { "data-bid": bid } : {};
}
