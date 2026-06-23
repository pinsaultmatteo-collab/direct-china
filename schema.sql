-- ============================================================
--  DIRECT CHINA — Schéma base produits (Supabase / PostgreSQL)
--  À coller dans Supabase → SQL Editor → Run.
--  Idempotent : peut être relancé sans casser l'existant.
-- ============================================================

-- ---------- Fonction utilitaire : updated_at automatique ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ============================================================
--  TABLE : categories
-- ============================================================
create table if not exists public.categories (
  id          text primary key,             -- ex: 'levage'
  name        text not null,                -- ex: 'Levage & élévation'
  num         text,                         -- ex: '02'
  icon        text,                         -- clé d'icône (habitat, levage, ...)
  blurb       text,                         -- phrase courte (grille catégories)
  intro       text,                         -- texte d'intro (vue catégorie)
  sort_order  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ============================================================
--  TABLE : products
-- ============================================================
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  category_id   text references public.categories(id) on delete set null,
  title         text not null,
  slug          text,
  summary       text,                       -- ligne courte affichée sur la carte
  description   text,                       -- description longue / marketing
  price_mode    text default 'quote',       -- 'quote' (sur devis) | 'fixed'
  price         numeric,                    -- si price_mode = 'fixed'
  price_label   text,                       -- libellé libre ('Sur devis', 'À partir de 2 500 €')
  supplier_url  text,                       -- lien Alibaba (interne, jamais affiché public)
  images        text[] default '{}',        -- URLs publiques (storage), dans l'ordre
  status        text default 'draft',       -- 'draft' | 'published'
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_status on public.products(status);

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ============================================================
--  SÉCURITÉ (Row Level Security)
--  - Le public (clé anon) ne lit QUE les produits publiés.
--  - Seuls les utilisateurs connectés (toi) peuvent écrire.
-- ============================================================
alter table public.categories enable row level security;
alter table public.products   enable row level security;

-- catégories : lecture publique, écriture connectée
drop policy if exists "categories_read" on public.categories;
create policy "categories_read" on public.categories
  for select using (true);

drop policy if exists "categories_write" on public.categories;
create policy "categories_write" on public.categories
  for all to authenticated using (true) with check (true);

-- produits : lecture publique des publiés, lecture totale + écriture pour connectés
drop policy if exists "products_read_published" on public.products;
create policy "products_read_published" on public.products
  for select using (status = 'published');

drop policy if exists "products_write" on public.products;
create policy "products_write" on public.products
  for all to authenticated using (true) with check (true);

-- ============================================================
--  STOCKAGE DES PHOTOS
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- lecture publique des images
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

-- upload / modif / suppression réservés aux connectés
drop policy if exists "product_images_auth_write" on storage.objects;
create policy "product_images_auth_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

-- ============================================================
--  SEED — les 6 catégories
-- ============================================================
insert into public.categories (id, name, num, icon, blurb, intro, sort_order) values
('habitat','Maisons capsules & modulaires','01','habitat',
 'Capsules habitables, modules préfabriqués, studios de jardin, extensions clé en main.',
 'Des structures habitables produites en usine, livrées prêtes à poser : capsules autonomes, modules container aménagés, studios de jardin.',1),
('levage','Levage & élévation','02','levage',
 'Mini-nacelles, plateformes à ciseaux, ponts élévateurs auto, transpalettes.',
 'Tout l''univers du levage et de l''élévation, du transpalette manuel à la nacelle automotrice.',2),
('precision','Soudage laser & cryogénie','03','precision',
 'Postes de soudage laser et stations de nettoyage cryogénique, au prix fabricant.',
 'Les technologies industrielles de pointe, accessibles au prix fabricant : soudage laser et nettoyage cryogénique sans solvant.',3),
('chantier','Équipement de chantier','04','chantier',
 'Machines à enduire les façades, gros ventilateurs de chantier.',
 'Le matériel lourd qui fait avancer vos chantiers : projection d''enduit et ventilation grand volume.',4),
('nautisme','Nautisme & spas','05','nautisme',
 'Coques de bateaux type semi-rigide, spas et bains nordiques.',
 'Les gros volumes loisirs, sans la marge des distributeurs : coques semi-rigides et spas.',5),
('verts','Espaces verts & motoculture','06','verts',
 'Tondeuses autoportées, tracteurs-tondeuses.',
 'De l''entretien d''espaces verts au prix direct usine : autoportées et tracteurs-tondeuses.',6)
on conflict (id) do update set
  name=excluded.name, num=excluded.num, icon=excluded.icon,
  blurb=excluded.blurb, intro=excluded.intro, sort_order=excluded.sort_order;

-- ============================================================
--  SEED — produits actuels (publiés, sans photo = tuile placeholder)
--  Relançable : on n'insère que si le titre n'existe pas déjà.
-- ============================================================
insert into public.products (category_id, title, summary, price_label, status, sort_order)
select v.category_id, v.title, v.summary, 'Sur devis', 'published', v.sort_order
from (values
  ('habitat','Capsule habitable autonome 20 m²','Studio tout équipé, structure acier, isolation renforcée. Livrée montée, raccordements prêts.',1),
  ('habitat','Maison modulaire container 40''HQ','Module aménagé 28 m², cuisine + salle d''eau. Empilable et raccordable pour agrandir.',2),
  ('habitat','Studio de jardin préfabriqué','De 12 à 30 m², ossature acier, baies vitrées. Idéal bureau, location ou chambre d''appoint.',3),
  ('habitat','Module bureau de chantier','Base vie isolée, électricité pré-câblée. Robuste, empilable, transport en container.',4),
  ('levage','Plateforme élévatrice à ciseaux','Hauteur de travail 10 m, électrique, autotractée. Idéale intérieur, sans émission.',1),
  ('levage','Mini-nacelle araignée 12 m','Compacte, chenillée, passe les portails. Stabilisateurs hydrauliques, châssis étroit.',2),
  ('levage','Pont élévateur 2 colonnes 4 T','Levage automobile, déverrouillage automatique. Norme CE définie avant production.',3),
  ('levage','Pont ciseau encastrable auto','Capacité 3 T, profil bas encastré. Géométrie et alignement, garage pro.',4),
  ('levage','Transpalette manuel 2,5 T','Fourches 1150 mm, roues polyuréthane. La référence robuste à prix usine.',5),
  ('levage','Gerbeur semi-électrique 1,5 T','Levée 3 m, montée électrique, traction manuelle. Compact pour entrepôt.',6),
  ('precision','Poste de soudage laser portatif 1500 W','Soudure, découpe et nettoyage 3-en-1. Refroidissement intégré, prise en main rapide.',1),
  ('precision','Poste de soudage laser 2000 W','Pour production intensive, source fibre. Pénétration supérieure, finition sans reprise.',2),
  ('precision','Station de nettoyage cryogénique','Décapage à la glace carbonique, sans eau ni solvant. Idéal moules, soudures, industrie.',3),
  ('chantier','Machine à projeter l''enduit','Crépisseuse pneumatique, débit réglable. Façades et plafonds, gain de temps majeur.',1),
  ('chantier','Ventilateur de chantier HVLS','Grand diamètre, brassage à bas régime. Ventile hangars et ateliers à faible coût.',2),
  ('chantier','Extracteur de chantier mobile','Gaine souple, fort débit. Évacuation poussières et gaz sur chantier confiné.',3),
  ('nautisme','Coque semi-rigide RIB 5,5 m','Flotteurs PVC ou Hypalon, console centrale. Coque V profond, finition gelcoat.',1),
  ('nautisme','Coque semi-rigide RIB 7,5 m','Version cabine, grande capacité. Pré-équipée pour motorisation hors-bord.',2),
  ('nautisme','Spa balnéo 5 places','Jets hydromassants, isolation pleine mousse, panneau synthétique. Prêt à poser.',3),
  ('nautisme','Bain nordique / spa bois','Cuve bois, poêle intégré ou électrique. Esthétique chalet, robustesse extérieure.',4),
  ('verts','Tondeuse autoportée 22 CV','Coupe 107 cm, bac de ramassage. Moteur bicylindre, transmission hydrostatique.',1),
  ('verts','Tracteur-tondeuse hydrostatique','Châssis renforcé, grande autonomie. Pour grandes surfaces et terrains exigeants.',2),
  ('verts','Autoportée zero-turn','Rayon de braquage nul, vitesse élevée. Productivité pro pour paysagistes.',3)
) as v(category_id, title, summary, sort_order)
where not exists (select 1 from public.products p where p.title = v.title);

-- ============================================================
--  FIN. Pense à créer ton utilisateur admin :
--  Supabase → Authentication → Users → Add user (email + mot de passe).
-- ============================================================
