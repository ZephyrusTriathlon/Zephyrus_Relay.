export const roles = [
  { name: 'Dispatcher', label: 'A clear plan. An informed decision.', copy: 'Bring orders, vehicle capacity and delivery requirements into view. Review feasibility, release the load and give every deferral a reason.', items: ['Order queue and trip allocation', 'Weight, volume and access checks', 'Delivery exceptions and receipt follow-up'], screen: 'dispatch' },
  { name: 'Loader', label: 'Every shipment. In the right sequence.', copy: 'Work through a reverse-stop loading manifest. Check each shipment, record shortages or damage, and resolve issues before departure.', items: ['Last stop loaded first', 'Shipment and carton verification', 'Loading issues with resolution notes'], screen: 'loader' },
  { name: 'Driver', label: 'The next stop. The next clear action.', copy: 'Follow the stop workflow from arrival to handover. Record delivery evidence or keep an unresolved stop open for a return visit.', items: ['Route and stop progression', 'Recipient, carton count and delivery time', 'Issue reporting and return visits'], screen: 'driver' },
  { name: 'Store', label: 'Close the loop at the receiving door.', copy: 'Follow an order through its delivery stages. Review the delivery receipt, confirm the cartons received and report discrepancies.', items: ['Order status and planned arrival', 'Delivery receipt review', 'Receipt confirmation and issue reporting'], screen: 'store' },
];
export const workflow = [
  ['Orders', 'Bring demand into view.', '01'], ['Plan & allocate', 'Check the real constraints.', '02'],
  ['Load', 'Prepare every shipment.', '03'], ['Deliver', 'Record every outcome.', '04'], ['Confirm', 'Close the receiving loop.', '05'],
];
export const faqs = [
  ['Is Relay only a route planner?', 'Relay connects ordering, dispatch planning, loading, delivery and receipt confirmation. Vehicle and trip allocation are part of that workflow, alongside the handoffs and exceptions that surround each delivery.'],
  ['Which planning constraints can teams review?', 'The planning experience checks weight, volume, temperature requirements, outlet access, depot compatibility, fuel allowance, trip limits and delivery windows. Incompatible assignments show the reason they cannot proceed.'],
  ['What happens when a delivery cannot be completed?', 'Drivers can record an issue and leave the stop outstanding for a return visit. Unresolved stops remain visible, and a route with outstanding deliveries is not marked complete.'],
  ['Who is Relay designed for?', 'Distribution and transport teams coordinating dispatchers, warehouse loaders, drivers and store receiving teams. Each role has a focused workspace for its part of the delivery cycle.'],
];
