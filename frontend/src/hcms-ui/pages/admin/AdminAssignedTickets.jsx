import AssignedTickets from '../shared/AssignedTickets';

export default function AdminAssignedTickets() {
  return <AssignedTickets title="Assigned to me" subtitle="Cases directly assigned to you" detailPath="/hcms/admin-assigned-tickets" assignedOnly />;
}
