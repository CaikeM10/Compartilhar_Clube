import Link from "next/link";

export default function PendentePage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center">
      <div>
        <h1 className="text-3xl font-bold mb-4">Pagamento pendente</h1>

        <p className="mb-6">Estamos aguardando a confirmação do pagamento.</p>

        <Link
          href="/"
          className="px-6 py-3 rounded-full bg-accent text-primary font-semibold"
        >
          Voltar ao site
        </Link>
      </div>
    </div>
  );
}
