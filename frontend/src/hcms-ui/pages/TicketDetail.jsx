import React,{useState,useEffect}from'react';import{useParams,useNavigate}from'react-router-dom';import{useAuth}from'../context/AuthContext';import{getCaseById,updateCase,getCaseHistory,getCaseComments,addCaseComment,updateCaseStatus,closeTicketAsEmployee,reopenTicket,uploadAttachments,downloadAttachment,getHRUsers,escalateCase,requestInfo,getCaseSLA,getInternalMessages,addCaseNote,respondToEscalationConsent,acknowledgeEscalationConsent}from'../services/caseApi';import{ChevronLeft,Send,Paperclip,RotateCcw,CheckCircle,X,Star,FileText,Download,MessageSquare,FileEdit,User,UserPlus,RefreshCw,ArrowUp,FileCheck,Shield,Clock,Globe,AlertTriangle,Tag}from'lucide-react';const card={background:'#FFFFFF',border:'1px solid #E2E8F0',borderRadius:16,overflow:'hidden',boxShadow:'0 1px 2px rgba(15,23,42,0.04)'};const f="'Inter',ui-sans-serif,system-ui,sans-serif";
function SP({status}){const m={open:{bg:'#FEE2E2',t:'#EF4444',l:'Open',d:'#EF4444'},new:{bg:'#FEE2E2',t:'#EF4444',l:'Open',d:'#EF4444'},in_progress:{bg:'#FEF3C7',t:'#F59E0B',l:'In Progress',d:'#F59E0B'},resolved:{bg:'#DBEAFE',t:'#3B82F6',l:'Resolved',d:'#3B82F6'},closed:{bg:'#D1FAE5',t:'#22C55E',l:'Closed',d:'#22C55E'},rejected:{bg:'#FEE2E2',t:'#DC2626',l:'Rejected',d:'#DC2626'},escalated:{bg:'#FEF3C7',t:'#F59E0B',l:'Escalated',d:'#F59E0B'},waiting:{bg:'#DBEAFE',t:'#3B82F6',l:'Waiting',d:'#3B82F6'}};const c=m[status]||m.open;return<span style={{display:'inline-flex',alignItems:'center',gap:6,height:26,padding:'0 12px',borderRadius:999,background:c.bg,color:c.t,fontSize:12,fontWeight:500}}><span style={{width:6,height:6,borderRadius:'50%',background:c.d}}/>{c.l}</span>;}
function PP({priority}){const m={low:{bg:'#DBEAFE',t:'#3B82F6',l:'Low'},medium:{bg:'#FEF3C7',t:'#F59E0B',l:'Medium'},high:{bg:'#FEF2F2',t:'#EF4444',l:'High'},critical:{bg:'#FEF2F2',t:'#EF4444',l:'Critical'}};const c=m[priority]||m.medium;return<span style={{display:'inline-flex',alignItems:'center',gap:6,height:26,padding:'0 12px',borderRadius:999,background:c.bg,color:c.t,fontSize:12,fontWeight:500}}>{c.l}</span>;}
function A({name,s=32}){const i=name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?';return<div style={{width:s,height:s,borderRadius:'50%',background:'#F1F5F9',color:'#64748B',display:'flex',alignItems:'center',justifyContent:'center',fontSize:s<32?10:12,fontWeight:600,flexShrink:0}}>{i}</div>;}
function sz(b){if(!b||b===0)return'0 Bytes';const k=1024,sz=['Bytes','KB','MB'];const i=Math.floor(Math.log(b)/Math.log(k));return Math.round(b/Math.pow(k,i)*100)/100+' '+sz[i];}
function ficon(t){if(t?.startsWith('image/'))return'🖼';if(t?.includes('pdf'))return'📄';return'📎';}
function tIcon(a){const i={created:FileText,updated:FileEdit,status_changed:RefreshCw,assigned:UserPlus,commented:MessageSquare,escalated:ArrowUp,resolved:FileCheck,closed:CheckCircle,reopened:RotateCcw,edited:FileEdit,attachments_uploaded:Paperclip,attachment_deleted:X,info_requested:AlertTriangle,returned_to_hr:RotateCcw,under_investigation:RefreshCw,rejected:X,pending_approval:Clock};return i[a]||FileText;}
function tClr(a){const c={created:'#3B82F6',updated:'#64748B',status_changed:'#F59E0B',assigned:'#3B82F6',commented:'#3B82F6',escalated:'#EF4444',resolved:'#22C55E',closed:'#22C55E',reopened:'#3B82F6',edited:'#64748B',attachments_uploaded:'#3B82F6',attachment_deleted:'#EF4444',info_requested:'#F59E0B',returned_to_hr:'#3B82F6',under_investigation:'#7C3AED',rejected:'#EF4444',pending_approval:'#F59E0B'};return c[a]||'#64748B';}
function tBg(a){const b={created:'#DBEAFE',updated:'#F1F5F9',status_changed:'#FEF3C7',assigned:'#DBEAFE',commented:'#DBEAFE',escalated:'#FEE2E2',resolved:'#D1FAE5',closed:'#D1FAE5',reopened:'#DBEAFE',edited:'#F1F5F9',attachments_uploaded:'#DBEAFE',attachment_deleted:'#FEE2E2',info_requested:'#FEF3C7',returned_to_hr:'#DBEAFE',under_investigation:'#EDE9FE',rejected:'#FEE2E2',pending_approval:'#FEF3C7'};return b[a]||'#F1F5F9';}
function tTitle(a){const t={created:'Ticket created',updated:'Updated',status_changed:'Status changed',assigned:'Assigned',commented:'Employee replied',escalated:'Escalated',resolved:'Resolved',closed:'Closed',reopened:'Reopened',edited:'Edited',attachments_uploaded:'Attachments uploaded',attachment_deleted:'Attachment deleted',info_requested:'Information requested',returned_to_hr:'Returned to HR',under_investigation:'Under investigation',rejected:'Rejected',pending_approval:'Pending approval'};return t[a]||(a?a.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()):'Activity');}
function tDesc(e){let actor=e.performed_by_name||e.user_name;if(!actor||actor==='Unknown User'||actor==='null'){if(e.action==='created')actor='System';else if(e.performed_by)actor='User #'+e.performed_by;else actor='System';}if(e.action==='created')return`Raised by ${actor} via Employee Portal.`;if(e.action==='assigned')return`Auto-assigned to ${actor}.`;if(e.action==='commented')return`${actor} posted a new message.`;if(e.action==='escalated'){const prev=e.details?.previous_level||'L1';const next=e.details?.new_level||'L2';return`Escalated from ${prev} to ${next} by ${actor}.`;}if(e.action==='info_requested')return e.details?.message?`${actor} requested: ${e.details.message}`:`${actor} requested more information.`;if(e.action==='status_changed'){const fmt=s=>s?s.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()):'';const st=e.details?.status||{};if(st.old&&st.new)return`${actor} changed status from ${fmt(st.old)} to ${fmt(st.new)}.`;return`${actor} changed status to ${fmt(st.new)}.`;}if(e.action==='edited'){const fields=e.details?.fields;if(Array.isArray(fields)&&fields.length>0){const fieldNames=fields.join(', ');return`${actor} edited: ${fieldNames}.`;}return`${actor} edited this ticket.`;}if(e.action==='assigned'){const assignee=e.details?.assignee_name||e.details?.assignee||'an agent';return`${actor} assigned this to ${assignee}.`;}if(e.action==='reassigned'){const assignee=e.details?.assignee_name||e.details?.assignee||'an agent';return`${actor} reassigned this to ${assignee}.`;}if(e.action==='resolved'){const reason=e.details?.reason;if(reason)return`${actor} resolved this ticket. Reason: ${reason}`;return`${actor} resolved this ticket.`;}if(e.action==='rejected'){const reason=e.details?.reason;if(reason)return`${actor} rejected this ticket. Reason: ${reason}`;return`${actor} rejected this ticket.`;}if(e.action==='closed'){const reason=e.details?.reason;if(reason)return`${actor} closed this ticket. Reason: ${reason}`;return`${actor} closed this ticket.`;}if(e.action==='reopened'){const reason=e.details?.reason;if(reason)return`${actor} reopened this ticket. Reason: ${reason}`;return`${actor} reopened this ticket.`;}if(e.action==='internal_note'||e.action==='note'){const note=e.details?.note||e.comment||e.details?.message;if(note)return`${actor} added an internal note.`;return`${actor} added a note.`;}if(e.action==='return'||e.action==='returned_to_hr'){return`${actor} returned this to HR.`;}if(e.action==='investigate'||e.action==='under_investigation'){return`${actor} marked this as under investigation.`;}if(e.action==='escalate_admin'||e.action==='escalated_to_admin'){return`${actor} escalated this to System Admin.`;}if(e.action==='resolve'||e.action==='resolved'){return`${actor} marked this as resolved.`;}if(e.action==='reject'||e.action==='rejected'){return`${actor} rejected this ticket.`;}if(e.action==='pending_approval'){return`${actor} moved this to pending approval.`;}return`${actor} performed this action.`;}
function fd(d){const date=new Date(d);const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return`${date.getDate()} ${m[date.getMonth()]} · ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;}

export default function TicketDetail(){
const{id}=useParams();const navigate=useNavigate();const{user}=useAuth();
const[caseData,setCaseData]=useState(null);const[permissions,setPermissions]=useState(null);const[history,setHistory]=useState([]);
const[comments,setComments]=useState([]);
const[pendingInfoRequests,setPendingInfoRequests]=useState([]);
const[pendingEscalationConsent,setPendingEscalationConsent]=useState(null);
const[unacknowledgedEscalationConsent,setUnacknowledgedEscalationConsent]=useState(null);
const[showConsentResponseModal,setShowConsentResponseModal]=useState(false);
const[escalationConsentComment,setEscalationConsentComment]=useState('');
const[slaTimers,setSlaTimers]=useState([]);
const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[successMsg,setSuccessMsg]=useState('');
const[isEditing,setIsEditing]=useState(false);const[editForm,setEditForm]=useState({});
const[newComment,setNewComment]=useState('');const[isSubmittingComment,setIsSubmittingComment]=useState(false);
const[showCloseModal,setShowCloseModal]=useState(false);
const[showConfirmCloseModal,setShowConfirmCloseModal]=useState(false);
const[showReopenModal,setShowReopenModal]=useState(false);
const[reopenReason,setReopenReason]=useState('');
const[newNote,setNewNote]=useState('');
const[isSubmittingNote,setIsSubmittingNote]=useState(false);const[internalNotes,setInternalNotes]=useState([]);
const[internalMessages,setInternalMessages]=useState([]);
const[caseAttachments,setCaseAttachments]=useState([]);
const[commentAttachments,setCommentAttachments]=useState([]);
const[showActionModal,setShowActionModal]=useState(false);
const[actionType,setActionType]=useState('');
const[actionReason,setActionReason]=useState('');
const[hrUsers,setHrUsers]=useState([]);
const[selectedAssignee,setSelectedAssignee]=useState('');
const[requestInfoMessage,setRequestInfoMessage]=useState('');
const[requestInfoAttachments,setRequestInfoAttachments]=useState([]);
const[showEscalateModal,setShowEscalateModal]=useState(false);
const[escalationReason,setEscalationReason]=useState('');
const isHr=user?.role==='hr_executive'||user?.role==='hr_manager'||user?.role==='system_admin';
const isHrManager=user?.role==='hr_manager'||user?.role==='system_admin';
const ticketsPath=user?.role==='hr_manager'?'/hcms/hr-manager-tickets':user?.role==='department_head'?'/hcms/dept-assigned-tickets':user?.role==='ceo'?'/hcms/ceo-tickets':user?.role==='system_admin'?'/hcms/admin-tickets':'/hcms/tickets';

useEffect(()=>{loadCaseData();if(isHr)loadHRUsers();loadSLAData();},[id]);
useEffect(()=>{if(isHr&&unacknowledgedEscalationConsent){setShowConsentResponseModal(true);}},[isHr,unacknowledgedEscalationConsent]);

const loadHRUsers=async()=>{try{const r=await getHRUsers();if(r.success)setHrUsers(r.users||[]);}catch(e){console.error('Failed to load assignable users:',e);}};

const loadSLAData=async()=>{try{const r=await getCaseSLA(id);if(r.success)setSlaTimers(r.timers||[]);}catch(e){console.error('Failed to load SLA data:',e);}};

const loadCaseData=async()=>{setLoading(true);setError('');try{const[cr,hr,cm,im]=await Promise.all([getCaseById(id),getCaseHistory(id),getCaseComments(id),isHr?getInternalMessages(id):Promise.resolve({success:true,messages:[]})]);if(cr.success){setCaseData(cr.case);setPermissions(cr.permissions||null);setEditForm({title:cr.case.title,description:cr.case.description,priority:cr.case.priority,status:cr.case.status});setPendingInfoRequests(cr.pendingInfoRequests||[]);setPendingEscalationConsent(cr.pendingEscalationConsent||null);setUnacknowledgedEscalationConsent(cr.unacknowledgedEscalationConsent||null);setCaseAttachments(cr.attachments||[]);setInternalNotes((cr.internal_notes||[]).map(n=>({id:n.id,text:n.text||n.note,author:n.author,initials:n.author?.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2)||'?',timestamp:n.created_at})));}else{setError(cr.message||'Failed');setPermissions(null);setPendingInfoRequests([]);setCaseAttachments([]);setInternalNotes([]);}if(hr.success){setHistory(hr.history||[]);}if(cm.success)setComments(cm.comments||[]);if(im.success){setInternalMessages((im.messages||[]).map(m=>({id:m.id,text:m.message,author:m.user_name||'Department Head',initials:m.user_name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'DH',timestamp:m.created_at,attachments:m.attachments||[]})));}else{setInternalMessages([]);}}catch(e){console.error(e);setError(e.response?.data?.message||'Network error');setInternalNotes([]);setInternalMessages([]);setPendingInfoRequests([]);setPermissions(null);}finally{setLoading(false);}};

const handleUpdate=async(e)=>{e.preventDefault();try{const r=await updateCase(id,editForm);if(r.success){setCaseData(r.case);setIsEditing(false);loadCaseData();}else setError(r.message||'Failed');}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleStatusUpdate=async(s)=>{try{const r=await updateCaseStatus(id,s);if(r.success)loadCaseData();else setError(r.message||'Failed');}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleActionConfirm=async()=>{try{let r;switch(actionType){case'in_progress':r=await updateCaseStatus(id,'in_progress');break;case'resolved':r=await updateCaseStatus(id,'resolved');break;case'waiting':r=await requestInfo(id,requestInfoMessage.trim());if(r.success&&requestInfoAttachments.length>0&&r.message_id){try{await uploadAttachments(id,requestInfoAttachments,r.message_id);}catch(uploadErr){console.error('[TicketDetail] Failed to upload request info attachments:',uploadErr);}}break;case'closed':r=await updateCaseStatus(id,'closed');break;case'reject':r=await updateCaseStatus(id,'rejected');if(r.success&&actionReason.trim()){await addCaseComment(id,{comment:`Ticket rejected. Reason: ${actionReason.trim()}`});}break;case'reassign':if(!selectedAssignee){setError('Please select an assignee to reassign to');return;}r=await updateCase(id,{assigned_to:selectedAssignee,status:'in_progress'});break;default:setError('Unknown action');return;}if(r.success){setShowActionModal(false);setActionType('');setActionReason('');setSelectedAssignee('');setRequestInfoMessage('');setRequestInfoAttachments([]);loadCaseData();}else setError(r.message||'Failed');}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleEscalate=async()=>{try{setError('');const r=await escalateCase(id,{reason:escalationReason.trim()});if(r.success){setShowEscalateModal(false);setEscalationReason('');setSuccessMsg(r.awaiting_consent?'Escalation consent request sent to the employee.':r.message);setTimeout(()=>setSuccessMsg(''),4000);loadCaseData();}else setError(r.message||'Failed to escalate');}catch(e){setError(e.response?.data?.message||'Network error');}};
const openEscalateModal=()=>{setEscalationReason('');setShowEscalateModal(true);};
const openActionModal=(type)=>{setActionType(type);setActionReason('');setSelectedAssignee('');setRequestInfoMessage('');setRequestInfoAttachments([]);setShowActionModal(true);};
const handleAddComment=async()=>{if(!newComment.trim())return;setIsSubmittingComment(true);try{const r=await addCaseComment(id,{comment:newComment});if(r.success){const messageId=r.message_id||r.comment?.id;setNewComment('');setCommentAttachments([]);if(commentAttachments.length>0&&messageId){try{await uploadAttachments(id,commentAttachments,messageId);}catch(uploadErr){console.error('[TicketDetail] Failed to upload comment attachments:',uploadErr);}}loadCaseData();}else setError(r.message||'Failed');}catch(e){console.error('[TicketDetail] Failed to add comment:',e);setError(e.response?.data?.message||'Network error');}finally{setIsSubmittingComment(false);}};
const handleClose=async(satisfied,reason='')=>{setError('');try{if(satisfied){const r=await closeTicketAsEmployee(id,true,5);if(r.success){setShowConfirmCloseModal(false);setCaseData(p=>p?{...p,status:'closed'}:p);setSuccessMsg('Ticket closed successfully.');setTimeout(()=>setSuccessMsg(''),4000);loadCaseData();}else setError(r.message||'Failed');}else{const r=await reopenTicket(id,reason||'Issue not resolved');if(r.success){setShowConfirmCloseModal(false);setReopenReason('');setCaseData(p=>p?{...p,status:'in_progress'}:p);setSuccessMsg('Ticket reopened.');setTimeout(()=>setSuccessMsg(''),4000);loadCaseData();}else setError(r.message||'Failed');}}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleReopen=async()=>{setError('');try{const r=await reopenTicket(id,reopenReason);if(r.success){setShowReopenModal(false);setReopenReason('');setCaseData(p=>p?{...p,status:'in_progress'}:p);setSuccessMsg('Ticket reopened.');setTimeout(()=>setSuccessMsg(''),4000);loadCaseData();}else setError(r.message||'Failed');}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleEscalationConsentResponse=async(requestId,response)=>{try{setError('');const r=await respondToEscalationConsent(id,requestId,{response,comments:escalationConsentComment.trim()});if(r.success){setEscalationConsentComment('');setSuccessMsg(r.message);setTimeout(()=>setSuccessMsg(''),4000);loadCaseData();}else setError(r.message||'Failed');}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleAcknowledgeConsent=async()=>{try{setError('');const req=unacknowledgedEscalationConsent;if(!req)return;const r=await acknowledgeEscalationConsent(id,req.id);if(r.success){setShowConsentResponseModal(false);setSuccessMsg(r.message);setTimeout(()=>setSuccessMsg(''),4000);loadCaseData();}else setError(r.message||'Failed');}catch(e){setError(e.response?.data?.message||'Network error');}};
const handleDlAtt=async(aid,fn,ft,download=false)=>{try{const r=await downloadAttachment(id,aid);const ct=r.headers?.['content-type']||ft||'application/octet-stream';const blob=new Blob([r.data],{type:ct});const u=window.URL.createObjectURL(blob);if(download){const a=document.createElement('a');a.href=u;a.download=fn||'attachment';document.body.appendChild(a);a.click();document.body.removeChild(a);}else{window.open(u,'_blank');}setTimeout(()=>window.URL.revokeObjectURL(u),60000);}catch(e){setError('Failed to open attachment');}};
const handleAddNote=async()=>{if(!newNote.trim())return;setIsSubmittingNote(true);try{const r=await addCaseNote(id,newNote.trim());if(r.success){setInternalNotes((r.data||[]).map(n=>({id:n.id,text:n.text||n.note,author:n.author,initials:n.author?.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2)||'?',timestamp:n.created_at})));setNewNote('');}else setError(r.message||'Failed to add note');}catch(e){console.error('[TicketDetail] Failed to add note:',e);setError(e.response?.data?.message||'Network error');}finally{setIsSubmittingNote(false);}};
const handleCommentAttachmentSelect=(e)=>{const files=Array.from(e.target.files);setCommentAttachments(p=>[...p,...files]);};
const handleRemoveCommentAttachment=(index)=>{setCommentAttachments(p=>p.filter((_,i)=>i!==index));};
const handleRequestInfoAttachmentSelect=(e)=>{const files=Array.from(e.target.files);setRequestInfoAttachments(p=>[...p,...files]);};
const handleRemoveRequestInfoAttachment=(index)=>{setRequestInfoAttachments(p=>p.filter((_,i)=>i!==index));};

const isSpecialCase=caseData?.reporting_mode==='confidential'||caseData?.reporting_mode==='sensitive'||caseData?.reporting_mode==='anonymous';
const hasPerm=(key)=>permissions?.[key]??!isSpecialCase;
const canViewEmployee=()=>hasPerm('can_view_employee_details');
const canAddC=()=>hasPerm('can_comment');
const canEdit=()=>hasPerm('can_edit')&&caseData?.status!=='closed';
const isOwner=caseData?.is_owner ?? Number(caseData?.created_by)===Number(user?.id);
const isAssignedToMe=Number(caseData?.assigned_to)===Number(user?.id);
const canStatus=()=>hasPerm('can_perform_actions')&&isHr&&(isAssignedToMe||isHrManager);
const canClose=()=>(hasPerm('can_close')||isOwner)&&caseData?.status==='resolved';
const canReopen=()=>hasPerm('can_perform_actions')&&caseData?.status==='closed';
const isLocked=caseData?.status==='closed';

const canMoveToInProgress=()=>hasPerm('can_perform_actions')&&(caseData?.status==='new'||caseData?.status==='open');
const canEscalate=()=>hasPerm('can_perform_actions')&&!pendingEscalationConsent&&(caseData?.status==='in_progress'||(caseData?.status==='escalated'&&caseData?.escalation_level!=='L5'));
const canMarkResolved=()=>hasPerm('can_resolve')&&['new','open','in_progress','escalated','waiting'].includes(caseData?.status);
const canRequestInfo=()=>hasPerm('can_comment')&&(caseData?.status==='in_progress'||caseData?.status==='new');
const canCancel=()=>hasPerm('can_perform_actions')&&caseData?.status!=='closed'&&caseData?.status!=='resolved';
const canReassign=()=>hasPerm('can_perform_actions')&&caseData?.status!=='closed'&&caseData?.status!=='resolved';

if(loading)return<div style={{padding:24,textAlign:'center',fontSize:13,color:'#64748B',fontFamily:f}}>Loading...</div>;
if(!caseData)return<div style={{padding:24,textAlign:'center',fontSize:13,color:'#64748B',fontFamily:f}}>Not found</div>;

const tid=caseData.ticket_id||`TKT-${String(caseData.id).padStart(4,'0')}`;
const rn=caseData.reporter_name||'Unknown';
const mc=comments.map(c=>({...c,message:c.comment||c.message,isEmployee:c.user_role==='employee'||c.user_id===caseData.reporter_id,initials:(c.user_name||'User').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}));
const tl=history.map(h=>({icon:tIcon(h.action),iconColor:tClr(h.action),iconBg:tBg(h.action),title:tTitle(h.action),description:tDesc(h),time:h.created_at?fd(h.created_at):''}));

const RMBadge=({mode})=>{
  const styles={
    normal:{bg:'#F1F5F9',color:'#64748B',label:'Normal'},
    confidential:{bg:'#FEF3C7',color:'#B45309',label:'Confidential'},
    sensitive:{bg:'#E0E7FF',color:'#4338CA',label:'Sensitive'},
    anonymous:{bg:'#F3E8FF',color:'#7E22CE',label:'Anonymous'}
  };
  const s=styles[mode]||styles.normal;
  return <span style={{padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:s.bg,color:s.color,display:'inline-flex',alignItems:'center',gap:4}}>{s.label}</span>;
};

const infoItems=[
{icon:FileText,label:'Subject',value:caseData.title||'—'},
{icon:FileEdit,label:'Description',value:caseData.description||'—'},
{icon:Tag,label:'Category',value:caseData.category||'—'},
{icon:Tag,label:'Subcategory',value:caseData.subcategory||'—'},
{icon:Globe,label:'Reporting Mode',value:<RMBadge mode={caseData.reporting_mode}/>},
{icon:Clock,label:'Created',value:caseData.created_at?new Date(caseData.created_at).toLocaleString():'—'},
{icon:Clock,label:'Updated',value:caseData.updated_at?new Date(caseData.updated_at).toLocaleString():'—'},
{icon:User,label:'Assignee',value:caseData.assignee_name||'Unassigned'},
{icon:User,label:'Reporter',value:caseData.reporter_name||'—'},
{icon:ArrowUp,label:'Current Escalation Level',value:caseData.escalation_level||'L1'},
{icon:ArrowUp,label:'Escalation Count',value:caseData.escalation_count??0},
{icon:AlertTriangle,label:'Escalation Status',value:caseData.is_escalated?'Escalated':'Not Escalated'},
{icon:Clock,label:'Last Escalated',value:caseData.last_escalated_at?new Date(caseData.last_escalated_at).toLocaleString():'Not Available'},
...(caseData.escalation_reason?[{icon:AlertTriangle,label:'Escalation Reason',value:caseData.escalation_reason}]:[]),
...slaTimers.length>0?[{icon:Clock,label:'SLA Response',value:slaTimers.find(t=>t.timer_type==='response')?.sla_deadline?new Date(slaTimers.find(t=>t.timer_type==='response').sla_deadline).toLocaleString():'—'}]:[],
...slaTimers.length>0?[{icon:Clock,label:'SLA Resolution',value:slaTimers.find(t=>t.timer_type==='resolution')?.sla_deadline?new Date(slaTimers.find(t=>t.timer_type==='resolution').sla_deadline).toLocaleString():'—'}]:[],
];

const btnBase={height:38,padding:'0 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,border:'none',fontFamily:f,width:'100%',marginBottom:8};
const btnPrimary={...btnBase,background:'#0F172A',color:'#FFFFFF'};
const btnSecondary={...btnBase,background:'#F1F5F9',color:'#0F172A',border:'1px solid #E2E8F0'};
const btnDanger={...btnBase,background:'#FEF2F2',color:'#EF4444',border:'1px solid #FECACA'};


return(
<div style={{fontFamily:f}}>
<button onClick={()=>navigate(ticketsPath)} style={{display:'flex',alignItems:'center',gap:6,marginBottom:16,background:'transparent',border:'none',color:'#64748B',fontSize:13,fontWeight:500,cursor:'pointer',padding:0}}><ChevronLeft size={16}/>Back to tickets</button>
{error&&<div style={{padding:'10px 14px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:10,color:'#EF4444',fontSize:13,marginBottom:16}}>{error}</div>}
{successMsg&&<div style={{padding:'10px 14px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10,color:'#16A34A',fontSize:13,marginBottom:16}}>{successMsg}</div>}
<div style={{marginBottom:20}}>
<div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8,flexWrap:'wrap'}}>
<h1 style={{fontSize:20,fontWeight:700,color:'#1E293B',margin:0}}>{caseData.title}</h1>
<SP status={caseData.status}/>
<RMBadge mode={caseData.reporting_mode}/>
</div>
<p style={{fontSize:13,color:'#64748B',margin:0}}>{tid} · {caseData.category||'General'} · Opened {caseData.created_at?new Date(caseData.created_at).toLocaleDateString():'—'}</p>
</div>

{pendingInfoRequests.length>0&&(
<div style={{padding:'14px 18px',borderRadius:12,background:'#FEF3C7',border:'1px solid #FDE68A',marginBottom:20}}>
<div style={{display:'flex',alignItems:'flex-start',gap:10}}>
<div style={{width:32,height:32,borderRadius:8,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><AlertTriangle size={16} color="#FFFFFF"/></div>
<div style={{flex:1}}>
<div style={{fontSize:14,fontWeight:700,color:'#1E293B',marginBottom:4}}>{user?.role==='employee'?'More information needed':'Waiting for employee response'}</div>
<div style={{fontSize:13,color:'#475569',lineHeight:1.5,marginBottom:6}}>{pendingInfoRequests[0].requester_name||'HR'} asked: <span style={{fontWeight:600}}>{pendingInfoRequests[0].message}</span></div>
{pendingInfoRequests[0].attachments&&pendingInfoRequests[0].attachments.length>0&&(
<div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
{pendingInfoRequests[0].attachments.map((att)=>(
<div key={att.id} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'#FFFFFF',borderRadius:8,fontSize:12,color:'#0F172A',border:'1px solid #E2E8F0'}}>
<Paperclip size={12} color="#64748B"/>
<span onClick={()=>handleDlAtt(att.id,att.file_name,att.file_type,false)} style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer',color:'#3B82F6'}} title="Open">{att.file_name}</span>
<button onClick={()=>handleDlAtt(att.id,att.file_name,att.file_type,true)} style={{background:'transparent',border:'none',color:'#3B82F6',cursor:'pointer',padding:0,display:'flex',alignItems:'center'}} title="Download">
<Download size={14}/>
</button>
</div>
))}
</div>
)}
<div style={{fontSize:12,color:'#64748B',marginTop:6}}>{user?.role==='employee'?'Please reply below with the requested details or attachments.':'The employee has been notified and can respond below.'}</div>
</div>
</div>
</div>
)}

{isOwner&&pendingEscalationConsent&&(
<div style={{padding:'14px 18px',borderRadius:12,background:'#EEF2FF',border:'1px solid #C7D2FE',marginBottom:20}}>
<div style={{display:'flex',alignItems:'flex-start',gap:10}}>
<div style={{width:32,height:32,borderRadius:8,background:'#6366F1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><ArrowUp size={16} color="#FFFFFF"/></div>
<div style={{flex:1}}>
<div style={{fontSize:14,fontWeight:700,color:'#1E293B',marginBottom:4}}>Escalation consent requested</div>
<div style={{fontSize:13,color:'#475569',lineHeight:1.5,marginBottom:6}}>Your case requires escalation to <span style={{fontWeight:600}}>{pendingEscalationConsent.requested_level}</span> for further investigation or resolution. Do you agree to proceed?</div>
{pendingEscalationConsent.reason&&<div style={{fontSize:12,color:'#64748B',marginBottom:8}}>Reason: {pendingEscalationConsent.reason}</div>}
{user?.role==='employee'&&(
<>
<textarea value={escalationConsentComment} onChange={e=>setEscalationConsentComment(e.target.value)} placeholder="Add optional comments explaining your decision..." rows={2} style={{width:'100%',padding:10,borderRadius:8,border:'1px solid #E2E8F0',fontSize:13,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'none',boxSizing:'border-box',marginBottom:8}}></textarea>
<div style={{display:'flex',gap:10}}>
<button onClick={()=>handleEscalationConsentResponse(pendingEscalationConsent.id,'approved')} style={{...btnPrimary,fontSize:13,padding:'8px 14px'}}><CheckCircle size={14}/> Approve Escalation</button>
<button onClick={()=>handleEscalationConsentResponse(pendingEscalationConsent.id,'rejected')} style={{...btnDanger,fontSize:13,padding:'8px 14px'}}><X size={14}/> Reject Escalation</button>
</div>
</>
)}
</div>
</div>
</div>
)}

<div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
<div style={{display:'flex',flexDirection:'column',gap:20}}>

{caseAttachments.length>0&&(
<div style={card}>
<div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0',display:'flex',alignItems:'center',gap:8}}>
<Paperclip size={16} color="#64748B"/>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Ticket Attachments</h2>
</div>
<div style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:10}}>
{caseAttachments.map(att=>{
const name=att.file_name||att.name;
const type=att.file_type||att.type;
const size=att.file_size||att.size;
return(
<div key={att.id} onClick={()=>handleDlAtt(att.id,name,type,true)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:'#F8FAFC',border:'1px solid #E2E8F0',cursor:'pointer'}}>
<div style={{fontSize:18}}>{ficon(type)}</div>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:13,fontWeight:600,color:'#1E293B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
<div style={{fontSize:12,color:'#64748B'}}>{type}{size?` · ${sz(size)}`:''}</div>
</div>
<Download size={16} color="#64748B"/>
</div>
);})}
</div>
</div>
)}

<div style={card}>
<div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0'}}>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Conversation</h2>
<p style={{fontSize:12,color:'#64748B',margin:'4px 0 0'}}>Messages between employee and HR.</p>
</div>
<div style={{padding:'18px 20px'}}>
{mc.length===0?(
<div style={{textAlign:'center',color:'#94A3B8',fontSize:13,padding:20}}>No messages yet</div>
):(
mc.map((m,i)=>{const isMe=m.user_id===user?.id;return(
<div key={m.id||i} style={{display:'flex',flexDirection:isMe?'row-reverse':'row',alignItems:'flex-start',gap:10,marginBottom:18}}>
<A name={m.user_name} s={34}/>
<div style={{maxWidth:'78%'}}>
<div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,justifyContent:isMe?'flex-end':'flex-start'}}>
<span style={{fontSize:13,fontWeight:600,color:'#1E293B'}}>{m.user_name}</span>
<span style={{fontSize:11,fontWeight:500,color:'#64748B',background:'#F1F5F9',borderRadius:999,padding:'1px 8px'}}>{m.user_role}</span>
<span style={{fontSize:12,color:'#94A3B8'}}>{m.created_at}</span>
</div>
<div style={{padding:'12px 16px',borderRadius:14,background:isMe?'#1E293B':'#F8FAFC',color:isMe?'#FFFFFF':'#1E293B',fontSize:14,lineHeight:1.6,border:isMe?'none':'1px solid #E2E8F0'}}>{m.message}</div>
{m.attachments&&m.attachments.length>0&&(
<div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8,justifyContent:isMe?'flex-end':'flex-start'}}>
{m.attachments.map((att,ai)=>(
<div key={ai} onClick={()=>handleDlAtt(att.id,att.file_name,att.file_type)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,background:isMe?'#334155':'#F1F5F9',cursor:'pointer',transition:'background 0.2s'}} onMouseEnter={e=>e.currentTarget.style.background=isMe?'#475569':'#E2E8F0'} onMouseLeave={e=>e.currentTarget.style.background=isMe?'#334155':'#F1F5F9'}>
<Paperclip size={12} color={isMe?'#94A3B8':'#64748B'}/>
<span style={{fontSize:12,color:isMe?'#F1F5F9':'#0F172A',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.file_name}</span>
</div>
))}
</div>
)}
</div>
</div>
);})
)}
</div>
{isLocked?(
<div style={{borderTop:'1px solid #E2E8F0',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:8,color:'#94A3B8',fontSize:13}}><CheckCircle size={15}/>This ticket is closed. Reopen it to add messages.</div>
):canAddC()&&(
<div style={{borderTop:'1px solid #E2E8F0',padding:'14px 20px'}}>
<div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
<A name={user?.name} s={34}/>
<div style={{flex:1}}>
<textarea value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder={pendingInfoRequests.length>0&&user?.role==='employee'?'Reply with the requested details or attachments...':'Write a reply to the employee...'} rows={3} style={{width:'100%',padding:12,borderRadius:12,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'none',boxSizing:'border-box',marginBottom:8}}/>
{commentAttachments.length>0&&(
<div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:8}}>
{commentAttachments.map((file,i)=>(
<div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'#F1F5F9',borderRadius:8,fontSize:12,color:'#0F172A'}}>
<Paperclip size={12} color="#64748B"/>
<span style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
<button onClick={()=>handleRemoveCommentAttachment(i)} style={{background:'transparent',border:'none',color:'#EF4444',cursor:'pointer',padding:0,display:'flex',alignItems:'center'}}>
<X size={14}/>
</button>
</div>
))}
</div>
)}
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
<div>
<input type="file" multiple onChange={handleCommentAttachmentSelect} style={{display:'none'}} id="comment-attachment-input"/>
<label htmlFor="comment-attachment-input" style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'none',color:'#64748B',fontSize:13,fontWeight:500,cursor:'pointer',padding:0}}>
<Paperclip size={15}/>Attach
</label>
</div>
<button onClick={handleAddComment} disabled={isSubmittingComment||!newComment.trim()} style={{height:34,padding:'0 16px',borderRadius:8,background:!newComment.trim()?'#CBD5E1':'#0F172A',color:'#FFFFFF',border:'none',fontSize:13,fontWeight:600,cursor:!newComment.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:5}}><Send size={13}/>Send reply</button>
</div>
</div>
</div>
</div>
)}
</div>

{isHr&&(
<div style={card}>
<div style={{padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #E2E8F0'}}>
<div>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Internal Notes</h2>
<p style={{fontSize:12,color:'#64748B',margin:'3px 0 0'}}>Visible only to HR, Department Head, and System Admin — not shared with the employee.</p>
</div>
<span style={{height:22,padding:'0 10px',borderRadius:999,background:'#FEF3C7',color:'#F59E0B',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4}}><Shield size={11}/>Internal only</span>
</div>
<div style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:14}}>
{[...internalMessages, ...internalNotes].length===0?(
<div style={{textAlign:'center',color:'#94A3B8',fontSize:13,padding:12}}>No internal notes yet</div>
):(
[...internalMessages, ...internalNotes].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(n=>(
<div key={n.id} style={{display:'flex',gap:10}}>
<A name={n.author} s={28}/>
<div style={{flex:1}}>
<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
<span style={{fontSize:13,fontWeight:600,color:'#1E293B'}}>{n.author}</span>
<span style={{fontSize:12,color:'#94A3B8'}}>{n.timestamp}</span>
</div>
<p style={{fontSize:13,color:'#475569',lineHeight:1.6,margin:0}}>{n.text}</p>
{n.attachments && n.attachments.length > 0 && (
  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
    {n.attachments.map(att => (
      <div key={att.id} onClick={() => handleDlAtt(att.id, att.file_name || att.name, att.file_type || att.type, false)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,background:'#F1F5F9',cursor:'pointer'}}>
        <Paperclip size={12} color="#64748B" />
        <span style={{fontSize:12,color:'#0F172A',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.file_name || att.name}</span>
      </div>
    ))}
  </div>
)}
</div>
</div>
)))}
{!isLocked&&canAddC()&&(<div style={{marginTop:6}}>
<textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Add a private note for the HR team..." rows={3} style={{width:'100%',padding:12,borderRadius:10,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'vertical',boxSizing:'border-box',marginBottom:8}}/>
<div style={{display:'flex',justifyContent:'flex-end'}}>
<button onClick={handleAddNote} disabled={isSubmittingNote||!newNote.trim()} style={{height:34,padding:'0 14px',borderRadius:8,background:!newNote.trim()?'#CBD5E1':'#0F172A',color:'#FFFFFF',border:'none',fontSize:13,fontWeight:600,cursor:!newNote.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:5}}><Shield size={13}/>Save note</button>
</div>
</div>)}
</div>
</div>
)}
</div>

<div style={{display:'flex',flexDirection:'column',gap:20}}>

{canStatus()&&(
<div style={card}>
<div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0'}}>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Actions</h2>
</div>
<div style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:8}}>
<button onClick={()=>openActionModal('in_progress')} disabled={!canMoveToInProgress()} style={{...btnPrimary,opacity:canMoveToInProgress()?1:0.5,cursor:canMoveToInProgress()?'pointer':'not-allowed'}}><Clock size={15}/>Move to In Progress</button>
<button onClick={()=>openActionModal('reassign')} disabled={!canReassign()} style={{...btnSecondary,opacity:canReassign()?1:0.5,cursor:canReassign()?'pointer':'not-allowed'}}><RotateCcw size={15}/>Reassign</button>
<button onClick={openEscalateModal} disabled={!canEscalate()} style={{...btnSecondary,opacity:canEscalate()?1:0.5,cursor:canEscalate()?'pointer':'not-allowed'}}><ArrowUp size={15}/>Escalate</button>
<button onClick={()=>openActionModal('resolved')} disabled={!canMarkResolved()} style={{...btnSecondary,opacity:canMarkResolved()?1:0.5,cursor:canMarkResolved()?'pointer':'not-allowed'}}><CheckCircle size={15}/>Mark Resolved</button>
<button onClick={()=>openActionModal('waiting')} disabled={!canRequestInfo()} style={{...btnSecondary,opacity:canRequestInfo()?1:0.5,cursor:canRequestInfo()?'pointer':'not-allowed'}}><AlertTriangle size={15}/>Request Info</button>
<button onClick={()=>openActionModal('reject')} disabled={!canCancel()} style={{...btnDanger,opacity:canCancel()?1:0.5,cursor:canCancel()?'pointer':'not-allowed'}}><X size={15}/>Reject Ticket</button>
</div>
</div>
)}

{(canClose()||canReopen())&&(
<div style={card}>
<div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0'}}>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Employee Actions</h2>
</div>
<div style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:8}}>
{canClose()&&<button onClick={()=>setShowConfirmCloseModal(true)} style={btnPrimary}><CheckCircle size={15}/>Close Ticket</button>}
{canReopen()&&<button onClick={()=>setShowReopenModal(true)} style={btnSecondary}><RotateCcw size={15}/>Reopen Ticket</button>}
</div>
</div>
)}

<div style={card}>
<div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0'}}>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Ticket Details</h2>
</div>
<div style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:14}}>
{infoItems.map((it,i)=>(
<div key={i} style={{display:'flex',alignItems:'flex-start',gap:10}}>
<div style={{width:28,height:28,borderRadius:8,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><it.icon size={14} color="#64748B"/></div>
<div>
<div style={{fontSize:12,color:'#64748B',marginBottom:2}}>{it.label}</div>
<div style={{fontSize:13,fontWeight:600,color:'#1E293B'}}>{it.value}</div>
</div>
</div>
))}
<div style={{display:'flex',alignItems:'center',gap:10,paddingTop:8,borderTop:'1px solid #F1F5F9'}}>
<div style={{width:28,height:28,borderRadius:8,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><AlertTriangle size={14} color="#64748B"/></div>
<div>
<div style={{fontSize:12,color:'#64748B',marginBottom:2}}>Priority</div>
<div style={{fontSize:13}}><PP priority={caseData.priority}/></div>
</div>
</div>
</div>
</div>

<div style={card}>
<div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0'}}>
<h2 style={{fontSize:15,fontWeight:700,color:'#1E293B',margin:0}}>Activity Timeline</h2>
<p style={{fontSize:12,color:'#64748B',margin:'3px 0 0'}}>Automatically generated history.</p>
</div>
<div style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:0}}>
{tl.length===0?(
<div style={{textAlign:'center',color:'#94A3B8',fontSize:13,padding:20}}>No activity yet</div>
):(
tl.map((t,i)=>(
<div key={i} style={{display:'flex',gap:12,paddingBottom:16,position:'relative'}}>
<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
<div style={{width:28,height:28,borderRadius:'50%',background:t.iconBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><t.icon size={13} color={t.iconColor}/></div>
{i<tl.length-1&&<div style={{width:2,flex:1,background:'#E2E8F0',marginTop:4}}/>}
</div>
<div style={{flex:1,paddingBottom:4}}>
<div style={{fontSize:13,fontWeight:600,color:'#1E293B',marginBottom:2}}>{t.title}</div>
<div style={{fontSize:12,color:'#64748B',lineHeight:1.5,marginBottom:2}}>{t.description}</div>
<div style={{fontSize:12,color:'#94A3B8'}}>{t.time}</div>
</div>
</div>
)))}
</div>
</div>
</div>
</div>

{/* Close/Confirm Modal */}
{showConfirmCloseModal&&(
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
<div style={{background:'#FFFFFF',borderRadius:16,padding:28,width:420,maxWidth:'90%',boxShadow:'0 20px 40px rgba(0,0,0,0.15)'}}>
<h3 style={{fontSize:18,fontWeight:700,color:'#1E293B',margin:'0 0 6px'}}>Confirm Ticket Closure</h3>
<p style={{fontSize:14,color:'#64748B',margin:'0 0 20px'}}>HR has marked this ticket as resolved. Is your issue resolved?</p>
<div style={{display:'flex',gap:10,marginBottom:20}}>
<button onClick={()=>handleClose(true)} style={{flex:1,height:42,borderRadius:10,background:'#22C55E',color:'#FFFFFF',border:'none',fontSize:14,fontWeight:600,cursor:'pointer'}}>Yes, Close Ticket</button>
<button onClick={()=>{setShowConfirmCloseModal(false);setShowReopenModal(true);}} style={{flex:1,height:42,borderRadius:10,background:'#EF4444',color:'#FFFFFF',border:'none',fontSize:14,fontWeight:600,cursor:'pointer'}}>No, Reopen</button>
</div>
<button onClick={()=>setShowConfirmCloseModal(false)} style={{width:'100%',height:42,borderRadius:10,background:'#F1F5F9',color:'#0F172A',border:'1px solid #E2E8F0',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
</div>
</div>
)}

{/* Reopen Modal */}
{showReopenModal&&(
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
<div style={{background:'#FFFFFF',borderRadius:16,padding:28,width:420,maxWidth:'90%',boxShadow:'0 20px 40px rgba(0,0,0,0.15)'}}>
<h3 style={{fontSize:18,fontWeight:700,color:'#1E293B',margin:'0 0 6px'}}>Reopen Ticket</h3>
<p style={{fontSize:14,color:'#64748B',margin:'0 0 14px'}}>Why do you want to reopen this ticket?</p>
<textarea value={reopenReason} onChange={e=>setReopenReason(e.target.value)} placeholder="Describe the issue..." rows={4} style={{width:'100%',padding:14,borderRadius:12,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'none',boxSizing:'border-box',marginBottom:16}}/>
<div style={{display:'flex',gap:10}}>
<button onClick={()=>{setShowReopenModal(false);setReopenReason('');}} style={{flex:1,height:42,borderRadius:10,background:'#F1F5F9',color:'#0F172A',border:'1px solid #E2E8F0',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
<button onClick={handleReopen} disabled={!reopenReason.trim()} style={{flex:1,height:42,borderRadius:10,background:!reopenReason.trim()?'#CBD5E1':'#0F172A',color:'#FFFFFF',border:'none',fontSize:14,fontWeight:600,cursor:!reopenReason.trim()?'not-allowed':'pointer'}}>Reopen</button>
</div>
</div>
</div>
)}

{/* Escalation Reason Modal */}
{showEscalateModal&&(
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
<div style={{background:'#FFFFFF',borderRadius:16,padding:28,width:420,maxWidth:'90%',boxShadow:'0 20px 40px rgba(0,0,0,0.15)'}}>
<h3 style={{fontSize:18,fontWeight:700,color:'#1E293B',margin:'0 0 6px'}}>Escalate Ticket</h3>
<p style={{fontSize:14,color:'#64748B',margin:'0 0 14px'}}>Provide a reason for escalating this ticket from {caseData?.escalation_level||'L1'} to the next level.</p>
<textarea value={escalationReason} onChange={e=>setEscalationReason(e.target.value)} placeholder="Reason for escalation (required)" rows={4} style={{width:'100%',padding:14,borderRadius:12,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'none',boxSizing:'border-box',marginBottom:16}}/>
<div style={{display:'flex',gap:10}}>
<button onClick={()=>{setShowEscalateModal(false);setEscalationReason('');}} style={{flex:1,height:42,borderRadius:10,background:'#F1F5F9',color:'#0F172A',border:'1px solid #E2E8F0',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
<button onClick={handleEscalate} disabled={!escalationReason.trim()} style={{flex:1,height:42,borderRadius:10,background:!escalationReason.trim()?'#CBD5E1':'#0F172A',color:'#FFFFFF',border:'none',fontSize:14,fontWeight:600,cursor:!escalationReason.trim()?'not-allowed':'pointer'}}>Confirm Escalation</button>
</div>
</div>
</div>
)}

{/* Action Confirmation Modal */}
{showActionModal&&(
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
<div style={{background:'#FFFFFF',borderRadius:16,padding:28,width:420,maxWidth:'90%',boxShadow:'0 20px 40px rgba(0,0,0,0.15)'}}>
<h3 style={{fontSize:18,fontWeight:700,color:'#1E293B',margin:'0 0 6px'}}>
{actionType==='in_progress'?'Move to In Progress':
actionType==='reassign'?'Reassign Ticket':
actionType==='resolved'?'Mark as Resolved':
actionType==='waiting'?'Request More Info':
actionType==='reject'?'Reject Ticket':
actionType==='closed'?'Cancel Ticket':'Confirm Action'}
</h3>
<p style={{fontSize:14,color:'#64748B',margin:'0 0 20px'}}>
{actionType==='in_progress'?'Are you sure you want to move this ticket to In Progress?':
actionType==='reassign'?'Select an assignee to reassign this ticket to:':
actionType==='resolved'?'Are you sure you want to mark this ticket as resolved?':
actionType==='waiting'?'Type your request for more information below. This will be sent to the employee:':
actionType==='reject'?'Provide a reason for rejecting this ticket. This will be sent to the employee:':
actionType==='closed'?'Are you sure you want to cancel this ticket?':'Do you want to perform this action?'}
</p>
{actionType==='reassign'&&(
<div style={{marginBottom:20}}>
<select value={selectedAssignee} onChange={e=>setSelectedAssignee(e.target.value)} style={{width:'100%',padding:12,borderRadius:10,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none'}}>
<option value="">Select assignee...</option>
{hrUsers.map(u=>(
<option key={u.id} value={u.id}>{u.name} ({u.email})</option>
))}
</select>
</div>
)}
{actionType==='waiting'&&(
<div style={{marginBottom:20}}>
<textarea value={requestInfoMessage} onChange={e=>setRequestInfoMessage(e.target.value)} placeholder="What information do you need from the employee?" rows={4} style={{width:'100%',padding:14,borderRadius:12,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'none',boxSizing:'border-box'}}/>
{requestInfoAttachments.length>0&&(
<div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
{requestInfoAttachments.map((file,i)=>(
<div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'#F1F5F9',borderRadius:8,fontSize:12,color:'#0F172A'}}>
<Paperclip size={12} color="#64748B"/>
<span style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
<button onClick={()=>handleRemoveRequestInfoAttachment(i)} style={{background:'transparent',border:'none',color:'#EF4444',cursor:'pointer',padding:0,display:'flex',alignItems:'center'}}>
<X size={14}/>
</button>
</div>
))}
</div>
)}
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
<div>
<input type="file" multiple onChange={handleRequestInfoAttachmentSelect} style={{display:'none'}} id="request-info-attachment-input"/>
<label htmlFor="request-info-attachment-input" style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'none',color:'#64748B',fontSize:13,fontWeight:500,cursor:'pointer',padding:0}}>
<Paperclip size={15}/>Attach document (optional)
</label>
</div>
</div>
</div>
)}
{actionType==='reject'&&(
<div style={{marginBottom:20}}>
<textarea value={actionReason} onChange={e=>setActionReason(e.target.value)} placeholder="Provide a reason for rejecting this ticket..." rows={4} style={{width:'100%',padding:14,borderRadius:12,border:'1px solid #E2E8F0',fontSize:14,fontFamily:f,color:'#1E293B',background:'#FFFFFF',outline:'none',resize:'none',boxSizing:'border-box'}}/>
</div>
)}
<div style={{display:'flex',gap:10}}>
<button onClick={()=>{setShowActionModal(false);setActionType('');setActionReason('');setSelectedAssignee('');setRequestInfoMessage('');setRequestInfoAttachments([]);}} style={{flex:1,height:42,borderRadius:10,background:'#F1F5F9',color:'#0F172A',border:'1px solid #E2E8F0',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
<button onClick={handleActionConfirm} disabled={(actionType==='reassign'&&!selectedAssignee)||(actionType==='waiting'&&!requestInfoMessage.trim())} style={{flex:1,height:42,borderRadius:10,background:((actionType==='reassign'&&!selectedAssignee)||(actionType==='waiting'&&!requestInfoMessage.trim()))?'#CBD5E1':'#0F172A',color:'#FFFFFF',border:'none',fontSize:14,fontWeight:600,cursor:((actionType==='reassign'&&!selectedAssignee)||(actionType==='waiting'&&!requestInfoMessage.trim()))?'not-allowed':'pointer'}}>Confirm</button>
</div>
</div>
</div>
)}

{/* Escalation Consent Response Modal */}
{showConsentResponseModal&&unacknowledgedEscalationConsent&&(
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
<div style={{background:'#FFFFFF',borderRadius:16,padding:28,width:460,maxWidth:'90%',boxShadow:'0 20px 40px rgba(0,0,0,0.15)'}}>
{unacknowledgedEscalationConsent.status==='approved'||unacknowledgedEscalationConsent.employee_response==='approved'?(
<>
<h3 style={{fontSize:18,fontWeight:700,color:'#1E293B',margin:'0 0 6px'}}>Escalation Consent Approved</h3>
<p style={{fontSize:14,color:'#64748B',margin:'0 0 20px',lineHeight:1.5}}>
The employee who raised this ticket has approved the escalation to <span style={{fontWeight:600}}>{unacknowledgedEscalationConsent.requested_level}</span>.
The ticket will be escalated when you click OK.
</p>
</>
):(
<>
<h3 style={{fontSize:18,fontWeight:700,color:'#1E293B',margin:'0 0 6px'}}>Escalation Consent Rejected</h3>
<p style={{fontSize:14,color:'#64748B',margin:'0 0 14px',lineHeight:1.5}}>
The employee who raised this ticket has rejected the escalation request. The ticket will remain at the current level <span style={{fontWeight:600}}>{unacknowledgedEscalationConsent.current_level}</span>.
</p>
{unacknowledgedEscalationConsent.employee_comments&&(
<div style={{padding:12,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:10,marginBottom:20}}>
<div style={{fontSize:12,fontWeight:600,color:'#991B1B',marginBottom:4}}>Reason for rejection</div>
<div style={{fontSize:13,color:'#7F1D1D',lineHeight:1.5}}>{unacknowledgedEscalationConsent.employee_comments}</div>
</div>
)}
</>
)}
<div style={{display:'flex',gap:10}}>
<button onClick={handleAcknowledgeConsent} style={{flex:1,height:42,borderRadius:10,background:'#0F172A',color:'#FFFFFF',border:'none',fontSize:14,fontWeight:600,cursor:'pointer'}}>
{unacknowledgedEscalationConsent.status==='approved'||unacknowledgedEscalationConsent.employee_response==='approved'?'OK, Escalate':'OK, I Understand'}
</button>
</div>
</div>
</div>
)}
</div>
)}
