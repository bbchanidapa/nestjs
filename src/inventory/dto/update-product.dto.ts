export class UpdateProductDto {
  sku?: string;
  name?: string;
  unit?: string;
  imageUrl?: string | null;
  price?: number;
  isActive?: boolean;
}
