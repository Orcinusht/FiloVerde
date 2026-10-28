import { PageHeader } from '@/components/page-header'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Bankroll · Filoverde' }

export default function Page() {
  return (
    <>
      <PageHeader title="Bankroll" />
      <ComingSoon text="Aquí llevarás tus depósitos, retiradas y saldo." />
    </>
  )
}
