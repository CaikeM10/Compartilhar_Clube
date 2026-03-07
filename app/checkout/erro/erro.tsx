import link from "next/link";
export default function ErroPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center">
      <div>
        <h1 className="text-2xl font-bold">Erro no Checkout</h1>
        <p> Pagamento não concluído.</p>
        <link href="/" className="text-blue-500 hover:underline">
          Voltar para a página inicial
        </link>
      </div>
    </div>
  );
}
