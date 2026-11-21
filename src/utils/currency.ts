export const ALVERON_LOGO_URL =
  '/assets/aistudio/gpt-image-2_we_have_to_generate_a_logo_of_brand_name_alveron_shows_premiums_and_also_make_th-0_1b4cfe78.jpg';

export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
