import Link from "next/link";

export default function SucessoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center">
      <div>
        <h1 className="text-3xl font-bold mb-4">Pagamento confirmado 🎉</h1>

        <p className="mb-6">
          Seu acesso ao Compartilhar Clube será liberado em instantes.
        </p>

        <Link
          href="/login"
          className="px-6 py-3 rounded-full bg-accent text-primary font-semibold"
        >
          Acessar plataforma
        </Link>
      </div>
    </div>
  );
}
