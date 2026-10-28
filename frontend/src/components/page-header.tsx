export function PageHeader({
  titre,
  description,
  surtitre,
  actions,
}: {
  titre: string;
  description?: string;
  surtitre?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {surtitre && <p className="surtitre mb-1">{surtitre}</p>}
        <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">{titre}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
