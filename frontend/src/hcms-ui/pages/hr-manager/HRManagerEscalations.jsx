import AssignedTickets from '../shared/AssignedTickets';

export default function HRManagerEscalations() {
  return <AssignedTickets title="Escalated" subtitle="Tickets escalated to you" detailPath="/hcms/hr-manager-escalations" escalated={true} />;
}
