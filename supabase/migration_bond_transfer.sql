-- Bond can be moved from one rental to another for the same customer (bike → scooter).
alter table rentals drop constraint if exists rentals_bond_status_check;
alter table rentals add constraint rentals_bond_status_check
  check (bond_status in ('awaiting','held','refunded','partially_refunded','retained','transferred'));
