import AssignedTickets from '../shared/AssignedTickets';

export default function CEOEscalations() {
  return <AssignedTickets title="Escalated" subtitle="Tickets escalated to you" detailPath="/hcms/ceo-escalations" escalated={true} />;
}
