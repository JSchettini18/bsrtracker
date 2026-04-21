export const categoryMap: Record<string, string> = {
  // Categorias principais
  'pc_display_on_website': 'Computadores e Informática',
  'kitchen_display_on_website': 'Cozinha',
  'home_display_on_website': 'Casa',
  'furniture_display_on_website': 'Móveis',
  'beauty_display_on_website': 'Beleza',
  'office_product_display_on_website': 'Produtos de Escritório',
  // Subcategorias (IDs numéricos)
  '16364844011': 'Caixas de Som',
  '16364764011': 'Ventiladores',
  '16364859011': 'Suportes para Notebook',
  '16754571011': 'Organizadores de Beleza',
  '17125189011': 'Potes Térmicos',
  '17125191011': 'Bolsas Térmicas',
  '17355089011': 'Luminárias',
  '17351382011': 'Lixeiras',
  '17354962011': 'Tesouras',
  '48724117011': 'Porta Ovos',
};

export const getCategoryName = (id: string | null): string => {
  if (!id) return 'N/A';
  return categoryMap[id] || id;
};
