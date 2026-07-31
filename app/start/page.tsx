import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { Estimator } from '@/components/Estimator';
import { PROJECTS, formatMoney } from '@/lib/pricing';

const cheapest = Math.min(...PROJECTS.map((p) => p.base));

export const metadata: Metadata = {
  title: 'Start a project | Bothmade',
  description: `Build your own estimate. Published prices from ${formatMoney(cheapest)}, every add-on labelled with exactly what it costs, and a total that updates as you choose.`,
  alternates: { canonical: '/start' },
  openGraph: {
    title: 'Start a project | Bothmade',
    description:
      'Build your own estimate. Published prices, every add-on labelled, no discovery call required to learn the number.',
    url: '/start',
    type: 'website',
  },
};

export default function StartPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <LuxuryCursor />
      <Nav />

      <section className="px-6 pt-40 pb-4 md:pt-48">
        <div className="mx-auto max-w-4xl">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-sky-300/60">
            Start a project
          </p>

          <h1
            className="mt-8 font-bold leading-[1.02] tracking-tight"
            style={{ fontSize: 'clamp(2.5rem, 7.5vw, 5rem)' }}
          >
            Tell us what you need.
            <span className="block text-white/40">Watch the price build.</span>
          </h1>

          <p className="mt-10 max-w-xl text-lg leading-relaxed text-white/50">
            Most studios make you sit through a discovery call to learn a number. Here
            it is up front: a base that ships a real product, and every option labelled
            with exactly what it adds. Nothing is hidden, including the parts that make
            a project cost more.
          </p>

          {/* The claim above is only worth making if the caveat sits right
              underneath it, at the same weight. */}
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/30">
            It takes about two minutes, and it is an estimate — not a binding quote. We
            confirm the real scope on a call.
          </p>
        </div>
      </section>

      <Estimator />

      <Footer />
    </main>
  );
}
